const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const mailer = require('../services/mailer.service');
const prisma = new PrismaClient();

const MAX_BYTES = 300 * 1024;   // le navigateur envoie ~6 ko, la marge est large
const ALLOWED_TYPES = new Set(['image/webp', 'image/jpeg', 'image/png']);

// Lettres, chiffres, espace et quelques signes. \p{L} accepte les accents.
const USERNAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} _.'°-]{1,19}$/u;
const INITIALS_RE = /^[\p{L}\p{N}]{1,3}$/u;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
// Liseré : "none" pour aucun, sinon une couleur. Absent = celui du thème.
const RING_RE = /^(none|#[0-9a-fA-F]{6})$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD = 8;
const BCRYPT_COST = 12;   // identique à l'inscription

const TOKEN_TTL_MS = 60 * 60 * 1000;   // une heure
const MAX_TOKENS_PER_HOUR = 5;         // garde-fou contre l'envoi en boucle

/** Jeton envoye par e-mail, et son empreinte — seule l'empreinte est stockee. */
function makeToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, tokenHash };
}

const hashOf = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

/** Retrouve un jeton utilisable, ou null. */
async function consumableToken(rawToken, kind) {
  if (!rawToken) return null;
  const row = await prisma.authToken.findUnique({
    where: { tokenHash: hashOf(rawToken) },
    include: { user: { select: { id: true, username: true, email: true } } },
  });
  if (!row || row.kind !== kind) return null;
  if (row.usedAt) return null;
  if (row.expiresAt < new Date()) return null;
  return row;
}

/** Trop de demandes dans l'heure ? */
async function tooManyTokens(userId, kind) {
  const since = new Date(Date.now() - TOKEN_TTL_MS);
  const count = await prisma.authToken.count({
    where: { userId, kind, createdAt: { gt: since } },
  });
  return count >= MAX_TOKENS_PER_HOUR;
}

const PUBLIC = {
  id: true, username: true, email: true, avatarColor: true, initials: true, avatarRing: true, createdAt: true,
};

/**
 * GET /api/users/:id/avatar
 *
 * Volontairement sans authentification : une balise <img> ne peut pas porter
 * d'en-tete Authorization. Ce qui fuit se limite a la photo de profil d'un
 * joueur dont on connait l'identifiant — acceptable pour une appli entre amis,
 * a savoir tout de meme.
 *
 * 404 quand il n'y a pas de photo : le composant du navigateur retombe alors
 * sur la pastille coloree avec l'initiale.
 */
exports.getAvatar = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).end();

  try {
    const row = await prisma.userAvatar.findUnique({ where: { userId: id } });
    if (!row) return res.status(404).end();

    res.set('Content-Type', row.mimeType || 'image/webp');
    // Court : une photo changee chez un autre joueur apparait en quelques
    // minutes sans qu'on ait a propager quoi que ce soit.
    res.set('Cache-Control', 'public, max-age=300');
    res.send(Buffer.from(row.data));
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
};

/** Decoupe une image en data URL, ou leve un message lisible. */
function decodeDataUrl(dataUrl) {
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl || '');
  if (!m) throw new Error('Image illisible');

  const mimeType = m[1].toLowerCase();
  if (!ALLOWED_TYPES.has(mimeType)) throw new Error('Format d image non accepte');

  const data = Buffer.from(m[2], 'base64');
  if (!data.length) throw new Error('Image vide');
  if (data.length > MAX_BYTES) throw new Error('Image trop lourde');

  return { mimeType, data };
}

/**
 * PATCH /api/users/me
 * { username?, avatarColor?, initials?, avatarRing?, avatar? }
 *
 * `avatar` vaut une data URL pour remplacer la photo, ou null pour la retirer.
 * Champ absent = on n'y touche pas.
 */
exports.updateMe = async (req, res) => {
  const { username, avatarColor, avatar, initials, avatarRing } = req.body;
  const data = {};

  if (username !== undefined) {
    const value = String(username).trim();
    if (!USERNAME_RE.test(value)) {
      return res.status(400).json({
        error: 'Pseudo invalide : de 2 à 20 caractères, lettres, chiffres, espace, . _ - ou \'',
      });
    }
    data.username = value;
  }

  // Chaine vide ou null : on revient a l'initiale du pseudo.
  if (initials !== undefined) {
    if (initials === null || String(initials).trim() === '') {
      data.initials = null;
    } else {
      const value = String(initials).trim().toUpperCase();
      if (!INITIALS_RE.test(value)) {
        return res.status(400).json({ error: 'Initiales invalides : 1 à 3 lettres ou chiffres' });
      }
      data.initials = value;
    }
  }

  if (avatarColor !== undefined) {
    if (!COLOR_RE.test(avatarColor)) {
      return res.status(400).json({ error: 'Couleur invalide' });
    }
    data.avatarColor = avatarColor;
  }

  if (avatarRing !== undefined) {
    if (avatarRing === null || String(avatarRing).trim() === '') {
      data.avatarRing = null;
    } else {
      const value = String(avatarRing).trim().toLowerCase();
      if (!RING_RE.test(value)) return res.status(400).json({ error: 'Liseré invalide' });
      data.avatarRing = value;
    }
  }

  try {
    // La photo vit dans sa propre table : deux ecritures, mais dans une seule
    // transaction pour ne pas laisser un pseudo change sans sa photo.
    const operations = [];

    if (Object.keys(data).length) {
      operations.push(prisma.user.update({ where: { id: req.user.id }, data, select: PUBLIC }));
    }

    if (avatar === null) {
      operations.push(prisma.userAvatar.deleteMany({ where: { userId: req.user.id } }));
    } else if (typeof avatar === 'string') {
      let decoded;
      try {
        decoded = decodeDataUrl(avatar);
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
      operations.push(prisma.userAvatar.upsert({
        where: { userId: req.user.id },
        create: { userId: req.user.id, ...decoded },
        update: decoded,
      }));
    }

    if (operations.length) await prisma.$transaction(operations);

    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: PUBLIC });
    const hasAvatar = !!(await prisma.userAvatar.findUnique({
      where: { userId: req.user.id }, select: { userId: true },
    }));

    res.json({ ...user, hasAvatar });
  } catch (err) {
    // P2002 : contrainte d'unicite — ici forcement le pseudo
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Ce pseudo est déjà pris' });
    }
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};


/**
 * PATCH /api/users/me/email   { email, currentPassword }
 *
 * Ne change rien tout de suite : envoie un lien de confirmation a la NOUVELLE
 * adresse. Tant que le lien n'est pas suivi, l'ancienne adresse reste celle du
 * compte — une faute de frappe ne peut donc pas enfermer quelqu'un dehors.
 *
 * Le mot de passe actuel reste exige : sans cela, un navigateur laisse ouvert
 * suffirait a lancer la procedure vers une adresse choisie par un tiers.
 */
exports.changeEmail = async (req, res) => {
  const { email, currentPassword } = req.body;
  const value = String(email || '').trim().toLowerCase();

  if (!EMAIL_RE.test(value)) return res.status(400).json({ error: 'Adresse invalide' });
  if (!currentPassword) return res.status(400).json({ error: 'Mot de passe actuel requis' });
  if (!mailer.isConfigured()) {
    return res.status(503).json({ error: 'L envoi d e-mails n est pas configure sur le serveur' });
  }

  try {
    const ok = await bcrypt.compare(String(currentPassword), req.user.password);
    if (!ok) return res.status(403).json({ error: 'Mot de passe actuel incorrect' });

    if (value === req.user.email) return res.status(400).json({ error: 'C est deja ton adresse' });

    const taken = await prisma.user.findUnique({ where: { email: value }, select: { id: true } });
    if (taken) return res.status(409).json({ error: 'Cette adresse est deja utilisee' });

    if (await tooManyTokens(req.user.id, 'EMAIL_CHANGE')) {
      return res.status(429).json({ error: 'Trop de demandes, reessaie dans une heure' });
    }

    const { token, tokenHash } = makeToken();
    await prisma.authToken.create({
      data: {
        userId: req.user.id,
        kind: 'EMAIL_CHANGE',
        tokenHash,
        payload: value,
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      },
    });

    await mailer.sendEmailChange(value, req.user.username, token);
    res.json({ pending: true, email: value });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Envoi impossible' });
  }
};

/**
 * POST /api/users/confirm-email   { token }
 * Public : la personne clique depuis sa boite mail, souvent sur un autre
 * appareil ou elle n'est pas connectee.
 */
exports.confirmEmail = async (req, res) => {
  try {
    const row = await consumableToken(req.body.token, 'EMAIL_CHANGE');
    if (!row) return res.status(400).json({ error: 'Lien invalide ou expire' });

    await prisma.$transaction([
      prisma.user.update({ where: { id: row.userId }, data: { email: row.payload } }),
      prisma.authToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      // Les autres demandes en cours n'ont plus lieu d'etre.
      prisma.authToken.updateMany({
        where: { userId: row.userId, kind: 'EMAIL_CHANGE', usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);

    res.json({ ok: true, email: row.payload });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Cette adresse a ete prise entre-temps' });
    }
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * POST /api/users/forgot-password   { email }
 *
 * Repond toujours la meme chose, que l'adresse existe ou non : sinon la route
 * dirait qui possede un compte.
 */
exports.forgotPassword = async (req, res) => {
  const value = String(req.body.email || '').trim().toLowerCase();
  const reply = { ok: true };

  if (!EMAIL_RE.test(value) || !mailer.isConfigured()) return res.json(reply);

  try {
    const user = await prisma.user.findUnique({
      where: { email: value }, select: { id: true, username: true, email: true },
    });
    if (!user) return res.json(reply);

    if (await tooManyTokens(user.id, 'PASSWORD_RESET')) return res.json(reply);

    const { token, tokenHash } = makeToken();
    await prisma.authToken.create({
      data: {
        userId: user.id,
        kind: 'PASSWORD_RESET',
        tokenHash,
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      },
    });

    await mailer.sendPasswordReset(user.email, user.username, token);
    res.json(reply);
  } catch (err) {
    console.error(err);
    res.json(reply);   // meme en cas d'echec, on ne revele rien
  }
};

/** POST /api/users/reset-password   { token, newPassword } */
exports.resetPassword = async (req, res) => {
  const { token, newPassword } = req.body;

  if (String(newPassword || '').length < MIN_PASSWORD) {
    return res.status(400).json({ error: `Le mot de passe doit faire au moins ${MIN_PASSWORD} caracteres` });
  }

  try {
    const row = await consumableToken(token, 'PASSWORD_RESET');
    if (!row) return res.status(400).json({ error: 'Lien invalide ou expire' });

    const hashed = await bcrypt.hash(String(newPassword), BCRYPT_COST);
    await prisma.$transaction([
      prisma.user.update({ where: { id: row.userId }, data: { password: hashed } }),
      prisma.authToken.updateMany({
        where: { userId: row.userId, kind: 'PASSWORD_RESET', usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * PATCH /api/users/me/password   { currentPassword, newPassword }
 *
 * A savoir : les jetons deja emis restent valides jusqu'a leur expiration.
 * Un changement de mot de passe ne deconnecte donc pas les autres appareils —
 * il faudrait pour cela tenir une liste de revocation, ce qui n'a pas grand
 * sens pour une appli entre amis.
 */
exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword) return res.status(400).json({ error: 'Mot de passe actuel requis' });
  if (String(newPassword || '').length < MIN_PASSWORD) {
    return res.status(400).json({ error: `Le nouveau mot de passe doit faire au moins ${MIN_PASSWORD} caracteres` });
  }
  if (String(newPassword) === String(currentPassword)) {
    return res.status(400).json({ error: 'Le nouveau mot de passe est identique a l ancien' });
  }

  try {
    const ok = await bcrypt.compare(String(currentPassword), req.user.password);
    if (!ok) return res.status(403).json({ error: 'Mot de passe actuel incorrect' });

    const hashed = await bcrypt.hash(String(newPassword), BCRYPT_COST);
    await prisma.user.update({ where: { id: req.user.id }, data: { password: hashed } });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};
