const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const MAX_BYTES = 300 * 1024;   // le navigateur envoie ~6 ko, la marge est large
const ALLOWED_TYPES = new Set(['image/webp', 'image/jpeg', 'image/png']);

// Lettres, chiffres, espace et quelques signes. \p{L} accepte les accents.
const USERNAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} _.'°-]{1,19}$/u;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const PUBLIC = {
  id: true, username: true, email: true, avatarColor: true, createdAt: true,
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
 * { username?, avatarColor?, avatar? }
 *
 * `avatar` vaut une data URL pour remplacer la photo, ou null pour la retirer.
 * Champ absent = on n'y touche pas.
 */
exports.updateMe = async (req, res) => {
  const { username, avatarColor, avatar } = req.body;
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

  if (avatarColor !== undefined) {
    if (!COLOR_RE.test(avatarColor)) {
      return res.status(400).json({ error: 'Couleur invalide' });
    }
    data.avatarColor = avatarColor;
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
