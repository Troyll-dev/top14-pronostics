const { PrismaClient } = require('@prisma/client');
const { estAdmin } = require('../middleware/admin.middleware');
const bannissement = require('../services/bannissement.service');

const prisma = new PrismaClient();

/**
 * La gestion des joueurs, cote administration.
 *
 * Quatre gestes, et trois d'entre eux ne se ressemblent que de loin :
 *
 *   la mise en pause sort un joueur du jeu sans rien effacer, et se defait ;
 *   la suppression efface le compte et tout ce qui s'y rattache ;
 *   le bannissement ferme l'inscription a une adresse, sans toucher aux comptes ;
 *   la moderation retire un message sans toucher a son auteur.
 *
 * Ce dernier vit dans `message.controller.js`, la ou vivent deja les messages.
 * Les trois autres sont ici.
 *
 * ---------------------------------------------------------------------------
 * CE QU'UNE SUPPRESSION EMPORTE
 * ---------------------------------------------------------------------------
 *
 * Tout, et c'est voulu : le schema declare `onDelete: Cascade` sur les
 * pronostics, les messages, la photo de profil, les jetons de connexion et les
 * rappels envoyes. Supprimer un compte ne laisse donc aucun orphelin.
 *
 * Mais cela veut dire aussi que les journees passees changent. Les pronostics
 * disparus ne comptent plus, donc le classement d'une journee d'octobre n'est
 * plus celui qu'on a lu en octobre, et un joueur qui figurait au podium d'une
 * journee n'y figure plus. C'est acceptable pour un intrus qui vient de
 * s'inscrire — il n'a pas d'histoire a abimer — et c'est une perte seche pour
 * un copain de cinq mois.
 *
 * Comme l'ecran ne peut pas deviner lequel des deux on supprime, il compte
 * avant de demander confirmation : « ce compte a 142 pronostics et 31 messages »
 * repond tout seul a la question. C'est l'objet de `GET /:id/consequences`.
 *
 * ---------------------------------------------------------------------------
 * LES GARDE-FOUS
 * ---------------------------------------------------------------------------
 *
 * On ne peut pas supprimer son propre compte depuis cette page, ni mettre en
 * pause un autre administrateur. Le premier evite la fausse manoeuvre qui
 * laisserait le site sans personne aux commandes ; le second evite qu'une
 * brouille entre administrateurs se regle a coups de boutons.
 *
 * Ces regles ne sont pas de la securite — un administrateur a de toute facon
 * acces a la base — mais de l'ergonomie : elles disent ce qui n'est pas prevu
 * ici, et obligent a passer par un geste plus delibere quand on le veut
 * vraiment.
 */

/**
 * GET /api/admin/joueurs
 *
 * La liste, avec de quoi decider sans cliquer : depuis quand, combien de
 * pronostics, combien de messages, adresse confirmee ou non, en pause ou non.
 *
 * Le tri place les comptes en pause a la fin et classe le reste par anciennete
 * — c'est l'ordre dans lequel on cherche quelqu'un.
 */
exports.liste = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        createdAt: true,
        emailVerifie: true,
        emailVerifieAt: true,
        enPause: true,
        pauseAt: true,
        mailRappels: true,
        mailBilan: true,
        _count: { select: { predictions: true, messages: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const dernierMessage = await prisma.message.groupBy({
      by: ['userId'],
      _max: { createdAt: true },
    });
    const dernier = Object.fromEntries(
      dernierMessage.map((m) => [m.userId, m._max.createdAt])
    );

    res.json(
      users
        .map((u) => ({
          id: u.id,
          username: u.username,
          email: u.email,
          createdAt: u.createdAt,
          emailVerifie: u.emailVerifie,
          emailVerifieAt: u.emailVerifieAt,
          enPause: u.enPause,
          pauseAt: u.pauseAt,
          mailRappels: u.mailRappels,
          mailBilan: u.mailBilan,
          admin: estAdmin(u),
          pronostics: u._count.predictions,
          messages: u._count.messages,
          dernierMessageAt: dernier[u.id] || null,
          moi: u.id === req.user.id,
        }))
        .sort((a, b) => Number(a.enPause) - Number(b.enPause))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * GET /api/admin/joueurs/:id/consequences
 *
 * Ce que la suppression emporterait. L'ecran l'affiche dans sa confirmation,
 * et c'est ce chiffre qui fait la difference entre expulser un intrus et
 * effacer un copain par megarde.
 */
exports.consequences = async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Identifiant invalide' });

  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true, email: true },
    });
    if (!user) return res.status(404).json({ error: 'Joueur introuvable' });

    const [pronostics, messages, journees] = await Promise.all([
      prisma.prediction.count({ where: { userId: id } }),
      prisma.message.count({ where: { userId: id } }),
      prisma.prediction.findMany({
        where: { userId: id },
        select: { match: { select: { round: true } } },
        distinct: ['matchId'],
      }),
    ]);

    const rounds = [...new Set(journees.map((p) => p.match.round))].sort((a, b) => a - b);

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      pronostics,
      messages,
      journees: rounds,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * PATCH /api/admin/joueurs/:id/pause   { enPause: true | false }
 *
 * Le meme champ que le joueur peut regler lui-meme depuis son profil. C'est
 * delibere : deux mecanismes paralleles auraient fini par se contredire, et
 * celui-ci existe pour les cas ou le joueur ne le fera pas lui-meme — celui qui
 * ne revient plus et qu'on retire du classement, celui qu'on ecarte le temps
 * d'une explication.
 *
 * `pauseAt` n'est renseigne qu'a la mise en pause et conserve ensuite : savoir
 * depuis quand quelqu'un est parti vaut mieux que de l'effacer a son retour.
 */
exports.pause = async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Identifiant invalide' });

  const enPause = req.body.enPause === true;

  try {
    const cible = await prisma.user.findUnique({ where: { id } });
    if (!cible) return res.status(404).json({ error: 'Joueur introuvable' });

    if (estAdmin(cible) && cible.id !== req.user.id) {
      return res.status(403).json({ error: 'On ne met pas un autre administrateur en pause' });
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        enPause,
        ...(enPause ? { pauseAt: new Date() } : {}),
        // Reprendre le jeu reactive les deux courriels, comme depuis le profil :
        // quelqu'un qu'on remet en jeu sans rappel du vendredi n'est pas vraiment
        // remis en jeu.
        ...(enPause ? {} : { mailRappels: true, mailBilan: true }),
      },
      select: { id: true, username: true, enPause: true, pauseAt: true },
    });

    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * DELETE /api/admin/joueurs/:id    { bannir?: boolean, motif?: string }
 *
 * La suppression, avec le bannissement de l'adresse en option dans le meme
 * geste — parce que c'est presque toujours la meme intention, et qu'un intrus
 * supprime sans bannissement revient le jour meme.
 *
 * L'ordre compte : on bannit d'abord, on supprime ensuite. Dans l'autre sens,
 * un echec du bannissement laisserait un compte efface et la porte ouverte,
 * c'est-a-dire le pire des deux mondes. Ici un echec laisse le compte en place,
 * et l'administrateur peut recommencer.
 */
exports.supprimer = async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Identifiant invalide' });

  if (id === req.user.id) {
    return res.status(400).json({ error: 'On ne supprime pas son propre compte depuis cette page' });
  }

  try {
    const cible = await prisma.user.findUnique({ where: { id } });
    if (!cible) return res.status(404).json({ error: 'Joueur introuvable' });

    if (estAdmin(cible)) {
      return res.status(403).json({
        error: 'Ce compte est administrateur : retire son adresse d\'ADMIN_EMAILS avant',
      });
    }

    let banni = null;
    if (req.body.bannir === true) {
      banni = await bannissement.bannir(cible.email, {
        motif: typeof req.body.motif === 'string' ? req.body.motif.slice(0, 200) : null,
        par: req.user.email,
      });
    }

    // La cascade du schema emporte pronostics, messages, photo, jetons et
    // rappels. Rien a supprimer a la main, et surtout rien a oublier.
    await prisma.user.delete({ where: { id } });

    res.json({ ok: true, id, username: cible.username, banni: !!banni });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/** GET /api/admin/joueurs/bannissements */
exports.bannissements = async (req, res) => {
  try {
    res.json(await bannissement.liste());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * POST /api/admin/joueurs/bannissements   { email, motif? }
 *
 * Bannir une adresse sans supprimer de compte. Sert au cas ou l'on sait a
 * l'avance qu'une adresse ne doit pas entrer.
 *
 * On previent si un compte existe deja avec cette adresse : le bannissement ne
 * le touche pas, et quelqu'un qui croirait avoir expulse un joueur en bannissant
 * son adresse se tromperait lourdement.
 */
exports.bannirAdresse = async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim() : '';
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Adresse invalide' });
  }

  try {
    const entree = await bannissement.bannir(email, {
      motif: typeof req.body.motif === 'string' ? req.body.motif.slice(0, 200) : null,
      par: req.user.email,
    });

    const comptes = await prisma.user.findMany({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, username: true },
    });

    res.status(201).json({ ...entree, comptesExistants: comptes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/** DELETE /api/admin/joueurs/bannissements/:id */
exports.leverBannissement = async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Identifiant invalide' });

  try {
    const fait = await bannissement.lever(id);
    if (!fait) return res.status(404).json({ error: 'Bannissement introuvable' });
    res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};
