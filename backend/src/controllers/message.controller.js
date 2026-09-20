const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const MAX_LENGTH = 1000;
const AUTHOR = { select: { id: true, username: true, avatarColor: true, initials: true, avatarRing: true } };

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

// DELETE /api/messages/:id — chacun ne peut retirer que ses propres messages
exports.deleteMessage = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Identifiant invalide' });

  try {
    const message = await prisma.message.findUnique({ where: { id } });
    if (!message) return res.status(404).json({ error: 'Message introuvable' });
    if (message.userId !== req.user.id) {
      return res.status(403).json({ error: 'Ce message n est pas le tien' });
    }

    await prisma.message.delete({ where: { id } });
    res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};
