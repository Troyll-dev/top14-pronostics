const { PrismaClient } = require('@prisma/client');
const { estAdmin } = require('../middleware/admin.middleware');

const prisma = new PrismaClient();

const MAX_LENGTH = 1000;

/**
 * Le Comptoir, et les messages privés.
 *
 * ---------------------------------------------------------------------------
 * UN SEUL MÉCANISME POUR DEUX USAGES
 * ---------------------------------------------------------------------------
 *
 * Un message a un auteur et, désormais, un destinataire qui peut être vide.
 * Vide, c'est le Comptoir : tout le monde le lit, et c'est exactement ce qui
 * existait — les messages déjà en base n'ont donc rien à devenir. Rempli, c'est
 * un message privé, et le fil entre deux joueurs est l'ensemble des messages où
 * l'un est l'auteur et l'autre le destinataire, dans les deux sens.
 *
 * Tout le reste — la saisie, la relecture toutes les six secondes, la
 * suppression de ses propres messages — sert les deux formes sans être écrit
 * deux fois. C'est la raison de ce choix : une table de conversations aurait
 * demandé des participants, des créations de fils, des cas limites, pour huit
 * joueurs qui se parlent deux par deux.
 *
 * ---------------------------------------------------------------------------
 * CE QUE L'ADMINISTRATION NE VOIT PAS
 * ---------------------------------------------------------------------------
 *
 * Les messages privés, jamais. La modération ne porte que sur le Comptoir, et
 * c'est une décision, pas un oubli : un salon public se modère, une
 * conversation entre deux personnes ne se lit pas — et si chacun savait
 * qu'elle peut l'être, personne ne s'en servirait.
 *
 * La règle est posée là où elle se joue : la lecture d'un fil privé n'est
 * accordée qu'à ses deux interlocuteurs, sans exception pour l'administrateur,
 * et la suppression d'un message privé reste réservée à son auteur. Les outils
 * contre un indésirable — pause, suppression, bannissement — n'ont pas besoin
 * de lire pour agir.
 */

/**
 * Ce que l'on renvoie de l'auteur d'un message.
 *
 * Le composant Avatar a besoin de quatre choses : l'identifiant pour aller
 * chercher la photo, la couleur de fond, les initiales choisies et le liseré.
 *
 * On ne renvoie surtout pas la photo elle-même : elle vit dans sa propre table
 * et se sert par son URL, sans quoi chaque message traînerait quelques
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

/** Le Comptoir porte le numéro de fil 0 : ce n'est l'identifiant de personne. */
const COMPTOIR = 0;

/**
 * Le filtre d'un fil, pour un joueur donné.
 *
 * Le Comptoir : les messages sans destinataire. Un fil privé : les messages
 * échangés entre ces deux-là, dans les deux sens — et uniquement entre eux,
 * d'où la forme en « ou » de deux couples complets plutôt qu'un « l'un ou
 * l'autre » qui ramasserait toutes les conversations de chacun.
 */
const filtreFil = (moi, avec) =>
  avec === COMPTOIR
    ? { destinataireId: null }
    : {
        OR: [
          { userId: moi, destinataireId: avec },
          { userId: avec, destinataireId: moi },
        ],
      };

/** Le numéro de fil demandé, ou null s'il est illisible. */
function filDemande(valeur) {
  if (valeur === undefined || valeur === null || valeur === '') return COMPTOIR;
  const n = Number.parseInt(valeur, 10);
  return Number.isNaN(n) || n < 0 ? null : n;
}

/**
 * GET /api/messages?avec=<id>&limit=100
 *
 * Les derniers messages d'un fil, du plus ancien au plus récent. Sans `avec`,
 * c'est le Comptoir — l'ancienne adresse continue donc de répondre exactement
 * comme avant, ce qui évite d'avoir à tout changer d'un coup.
 *
 * Volontairement pas de pagination incrémentale : le fil est relevé en entier à
 * chaque interrogation. Avec quelques amis et une centaine de messages, c'est
 * quelques kilo-octets, et surtout une suppression disparaît immédiatement chez
 * l'autre — ce qu'un « donne-moi la suite depuis l'id N » ne saurait pas faire.
 */
exports.getMessages = async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);
  const avec = filDemande(req.query.avec);
  if (avec === null) return res.status(400).json({ error: 'Fil invalide' });

  try {
    if (avec !== COMPTOIR) {
      const autre = await prisma.user.findUnique({ where: { id: avec }, select: { id: true } });
      if (!autre) return res.status(404).json({ error: 'Joueur introuvable' });
    }

    const rows = await prisma.message.findMany({
      where: filtreFil(req.user.id, avec),
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
 * GET /api/messages/fils
 *
 * De quoi dessiner la liste des conversations en un seul appel : le Comptoir,
 * puis un rang par joueur, chacun avec son dernier message, sa date et son
 * nombre de non-lus.
 *
 * Un seul appel, et c'est délibéré : huit requêtes depuis l'écran — une par
 * copain — mettraient la liste à la merci du plus lent, et la page clignoterait
 * en se remplissant par morceaux.
 *
 * Les non-lus se comptent à partir de `lectures`, côté serveur. Ils vivaient
 * dans le navigateur, et ça se voyait : on lisait sur son téléphone, le PC
 * gardait sa pastille. Avec un seul salon c'était supportable ; avec huit fils,
 * ce serait huit pastilles fausses.
 *
 * Ses propres messages ne comptent jamais comme non lus — on sait ce qu'on
 * vient d'écrire.
 */
exports.getFils = async (req, res) => {
  const moi = req.user.id;

  try {
    const [joueurs, lectures] = await Promise.all([
      prisma.user.findMany({
        where: { id: { not: moi }, bot: false },
        select: { id: true, username: true, avatarColor: true, initials: true, avatarRing: true, enPause: true },
        orderBy: { username: 'asc' },
      }),
      prisma.lecture.findMany({ where: { userId: moi } }),
    ]);

    const luAt = Object.fromEntries(lectures.map((l) => [l.fil, l.luAt]));

    /** Le dernier message et le nombre de non-lus d'un fil. */
    const resume = async (fil) => {
      const where = filtreFil(moi, fil);
      const dernier = await prisma.message.findFirst({
        where,
        orderBy: { id: 'desc' },
        include: { user: { select: { id: true, username: true } } },
      });

      const depuis = luAt[fil];
      const nonLus = await prisma.message.count({
        where: {
          ...where,
          userId: { not: moi },
          ...(depuis ? { createdAt: { gt: depuis } } : {}),
        },
      });

      return {
        fil,
        nonLus,
        dernier: dernier
          ? {
              id: dernier.id,
              auteur: dernier.user.username,
              deMoi: dernier.user.id === moi,
              body: dernier.body.slice(0, 120),
              createdAt: dernier.createdAt,
            }
          : null,
      };
    };

    const comptoir = await resume(COMPTOIR);
    const prives = [];
    for (const j of joueurs) prives.push({ ...j, ...(await resume(j.id)) });

    res.json({
      comptoir,
      prives,
      total: comptoir.nonLus + prives.reduce((s, p) => s + p.nonLus, 0),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * GET /api/messages/unread
 *
 * Le total des non-lus, tous fils confondus : c'est ce que porte la pastille de
 * la barre de navigation.
 *
 * L'ancienne version prenait un paramètre `since` que l'écran gardait dans le
 * navigateur. Il est devenu inutile — la date de lecture est en base — mais la
 * route garde son nom et son champ `count`, pour qu'un onglet resté ouvert sur
 * l'ancienne version du site continue d'afficher quelque chose de sensé le
 * temps qu'il se recharge.
 */
exports.getUnread = async (req, res) => {
  const moi = req.user.id;

  try {
    const lectures = await prisma.lecture.findMany({ where: { userId: moi } });
    const luAt = Object.fromEntries(lectures.map((l) => [l.fil, l.luAt]));

    const depuisComptoir = luAt[COMPTOIR];
    const comptoir = await prisma.message.count({
      where: {
        destinataireId: null,
        userId: { not: moi },
        ...(depuisComptoir ? { createdAt: { gt: depuisComptoir } } : {}),
      },
    });

    // Les messages privés reçus, comptés auteur par auteur : chacun a sa propre
    // date de lecture, donc une seule requête globale donnerait un faux total.
    const recus = await prisma.message.groupBy({
      by: ['userId'],
      where: { destinataireId: moi },
      _max: { createdAt: true },
      _count: { _all: true },
    });

    let prives = 0;
    for (const r of recus) {
      const depuis = luAt[r.userId];
      prives += await prisma.message.count({
        where: {
          userId: r.userId,
          destinataireId: moi,
          ...(depuis ? { createdAt: { gt: depuis } } : {}),
        },
      });
    }

    res.json({ count: comptoir + prives, comptoir, prives });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * POST /api/messages/lu   { fil }
 *
 * « J'ai tout lu dans ce fil, jusqu'à maintenant. »
 *
 * L'écran l'appelle en ouvrant un fil et à chaque arrivée de message pendant
 * qu'il est ouvert. L'opération est un `upsert` : la première lecture crée la
 * ligne, les suivantes la repoussent, et l'écran n'a pas à savoir laquelle des
 * deux il déclenche.
 */
exports.marquerLu = async (req, res) => {
  const fil = filDemande(req.body.fil);
  if (fil === null) return res.status(400).json({ error: 'Fil invalide' });

  try {
    const luAt = new Date();
    await prisma.lecture.upsert({
      where: { userId_fil: { userId: req.user.id, fil } },
      update: { luAt },
      create: { userId: req.user.id, fil, luAt },
    });
    res.json({ ok: true, fil, luAt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * POST /api/messages   { body, destinataireId? }
 *
 * Sans destinataire, le message part au Comptoir. Avec, il ne sera lisible que
 * par son auteur et son destinataire.
 *
 * Trois refus, et chacun évite une conversation qui n'aurait pas de réponse :
 * s'écrire à soi-même, écrire à quelqu'un qui n'existe pas, et écrire à Bob —
 * qui n'a pas de mains, et dont le compte ne sert qu'à signer les messages de
 * bienvenue.
 */
exports.createMessage = async (req, res) => {
  const body = typeof req.body.body === 'string' ? req.body.body.trim() : '';

  if (!body) return res.status(400).json({ error: 'Message vide' });
  if (body.length > MAX_LENGTH) {
    return res.status(400).json({ error: `Message trop long (${MAX_LENGTH} caracteres maximum)` });
  }

  const brut = req.body.destinataireId;
  const destinataireId =
    brut === undefined || brut === null || brut === '' || Number(brut) === COMPTOIR
      ? null
      : Number.parseInt(brut, 10);

  if (destinataireId !== null && Number.isNaN(destinataireId)) {
    return res.status(400).json({ error: 'Destinataire invalide' });
  }

  try {
    if (destinataireId !== null) {
      if (destinataireId === req.user.id) {
        return res.status(400).json({ error: 'On ne s\'ecrit pas a soi-meme' });
      }
      const cible = await prisma.user.findUnique({
        where: { id: destinataireId },
        select: { id: true, bot: true, username: true },
      });
      if (!cible) return res.status(404).json({ error: 'Joueur introuvable' });
      if (cible.bot) return res.status(400).json({ error: 'Bob ne lit pas ses messages' });
    }

    const message = await prisma.message.create({
      data: { userId: req.user.id, destinataireId, body },
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
 * Chacun retire ses propres messages. L'administrateur retire n'importe quel
 * message **du Comptoir** — et rien d'autre.
 *
 * C'est la modération, et la limite est le coeur du sujet. Le besoin : une
 * parole de trop dans le salon n'oblige pas à s'en prendre à son auteur. Sans
 * ce petit marteau, le seul outil disponible était la suppression du compte ou
 * la mise en pause — punir quelqu'un pour une phrase, faute de pouvoir retirer
 * la phrase. Mais ce marteau s'arrête à la porte des conversations privées : il
 * n'y a rien à y moderer, puisque personne d'autre que les deux interlocuteurs
 * n'y est exposé.
 *
 * Aucune trace n'est conservée, et c'est assumé : entre huit amis, un registre
 * des messages effacés serait plus gênant que le message effacé.
 */
exports.deleteMessage = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Identifiant invalide' });

  try {
    const message = await prisma.message.findUnique({ where: { id } });
    if (!message) return res.status(404).json({ error: 'Message introuvable' });

    const mien = message.userId === req.user.id;
    const moderable = message.destinataireId === null && estAdmin(req.user);

    if (!mien && !moderable) {
      return res.status(403).json({ error: 'Ce message n est pas le tien' });
    }

    await prisma.message.delete({ where: { id } });
    res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};
