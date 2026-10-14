const { PrismaClient } = require('@prisma/client');
const { estAdmin } = require('../middleware/admin.middleware');

const prisma = new PrismaClient();

const MAX_LENGTH = 1000;
/**
 * Ce que l'on renvoie de l'auteur d'un message.
 *
 * Le composant Avatar a besoin de quatre choses : l'identifiant pour aller
 * chercher la photo, la couleur de fond, les initiales choisies et le liseré.
 * Il en manquait deux, et le chat retombait donc sur la pastille par defaut
 * alors que chacun avait configure la sienne.
 *
 * On ne renvoie surtout pas la photo elle-meme : elle vit dans sa propre table
 * et se sert par son URL, sans quoi chaque message trainerait quelques
 * kilo-octets d'image.
 */
const AUTHOR = {
  select: {
    id: true,
    username: true,
    avatarColor: true,
    initials: true,
    avatarRing: true,
  },
};

/**
 * GET /api/messages?limit=100
 *
 * Renvoie les derniers messages, du plus ancien au plus recent.
 *
 * Volontairement pas de pagination incrementale : le salon est releve en
 * entier a chaque interrogation. Avec quelques amis et une centaine de
 * messages, c'est quelques kilo-octets, et surtout une suppression disparait
 * immediatement chez les autres — ce qu'un « donne-moi la suite depuis l'id N »
 * ne saurait pas faire.
 */
exports.getMessages = async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);

  try {
    const rows = await prisma.message.findMany({
      orderBy: { id: 'desc' },
      take: limit,
      include: { user: AUTHOR },
    });
    res.json(rows.reverse());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * GET /api/messages/unread?since=<ISO>
 *
 * Nombre de messages des autres joueurs depuis la derniere visite. Sert la
 * pastille de la barre de navigation.
 *
 * Sans `since`, on renvoie zero plutot que tout l'historique : un nouvel
 * arrivant n'a pas a decouvrir l'appli avec une pastille a 300.
 */
exports.getUnread = async (req, res) => {
  const raw = req.query.since;
  const since = raw ? new Date(raw) : null;

  try {
    if (!since || Number.isNaN(since.getTime())) {
      const last = await prisma.message.findFirst({
        orderBy: { id: 'desc' }, select: { createdAt: true },
      });
      return res.json({ count: 0, lastAt: last ? last.createdAt : null });
    }

    const count = await prisma.message.count({
      where: { createdAt: { gt: since }, userId: { not: req.user.id } },
    });
    const last = await prisma.message.findFirst({
      orderBy: { id: 'desc' }, select: { createdAt: true },
    });

    res.json({ count, lastAt: last ? last.createdAt : null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// POST /api/messages  { body }
exports.createMessage = async (req, res) => {
  const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';

  if (!body) return res.status(400).json({ error: 'Message vide' });
  if (body.length > MAX_LENGTH) {
    return res.status(400).json({ error: `Message trop long (${MAX_LENGTH} caracteres maximum)` });
  }

  try {
    const message = await prisma.message.create({
      data: { userId: req.user.id, body },
      include: { user: AUTHOR },
    });
    res.status(201).json(message);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * DELETE /api/messages/:id
 *
 * Chacun retire ses propres messages ; l'administrateur retire n'importe lequel.
 *
 * C'est la moderation, et elle tient en une ligne parce qu'elle n'avait pas
 * besoin de plus. Le besoin : un message deplace n'oblige pas a s'en prendre a
 * son auteur. Sans ce petit marteau, le seul outil disponible contre une parole
 * de trop etait la suppression du compte ou la mise en pause — c'est-a-dire
 * punir quelqu'un pour une phrase, faute de pouvoir retirer la phrase.
 *
 * Aucune trace n'est conservee, et c'est assumé : entre huit amis, un registre
 * des messages effaces serait plus gênant que le message efface. Les autres
 * voient la disparition au plus tard six secondes apres, le salon etant relu en
 * entier a chaque interrogation.
 */
exports.deleteMessage = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Identifiant invalide' });

  try {
    const message = await prisma.message.findUnique({ where: { id } });
    if (!message) return res.status(404).json({ error: 'Message introuvable' });

    if (message.userId !== req.user.id && !estAdmin(req.user)) {
      return res.status(403).json({ error: 'Ce message n est pas le tien' });
    }

    await prisma.message.delete({ where: { id } });
    res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};
