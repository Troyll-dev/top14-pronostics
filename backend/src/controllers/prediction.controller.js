const { PrismaClient } = require('@prisma/client');
const { DEPUIS, afficheDeLaJournee, journeeCommencee } = require('../services/rules');

const prisma = new PrismaClient();

const SEASON = process.env.SPORTSDB_SEASON || '2026-2027';

/**
 * Le match de la semaine d'une journée.
 *
 * Il n'est pas désigné à la main : c'est la rencontre qui commence le plus
 * tard, autrement dit l'affiche du dimanche soir. Pas de page d'administration
 * à maintenir, et les joueurs peuvent le déduire eux-mêmes du calendrier.
 *
 * Mais il est **figé dès le premier coup d'envoi de la journée**. Sans ce gel,
 * un décalage annoncé par la LNR le samedi soir déplacerait l'affiche au milieu
 * de la journée, après que des joueurs ont placé leur joker en conséquence — on
 * changerait la règle en cours de partie. Tant que la journée n'a pas commencé
 * on recalcule ; ensuite on croit ce qui est écrit en base.
 */
async function afficheDe(round) {
  const matchs = await prisma.match.findMany({
    where: { round, season: SEASON },
    select: { id: true, kickoff: true, featured: true },
  });
  if (!matchs.length) return null;

  if (journeeCommencee(matchs)) return matchs.find((m) => m.featured) || null;
  return afficheDeLaJournee(matchs);
}

// POST /api/predictions — soumettre / mettre à jour un pronostic
exports.upsertPrediction = async (req, res) => {
  const { matchId, homeScorePred, awayScorePred } = req.body;
  const userId = req.user.id;

  if (homeScorePred === undefined || awayScorePred === undefined || !matchId) {
    return res.status(400).json({ error: 'matchId, homeScorePred et awayScorePred requis' });
  }
  if (homeScorePred < 0 || awayScorePred < 0) {
    return res.status(400).json({ error: 'Les scores ne peuvent pas être négatifs' });
  }

  try {
    // Vérifier que le match n'est pas encore commencé
    const match = await prisma.match.findUnique({ where: { id: parseInt(matchId) } });
    if (!match) return res.status(404).json({ error: 'Match introuvable' });
    if (match.status !== 'SCHEDULED') {
      return res.status(400).json({ error: 'Les pronostics sont fermés pour ce match' });
    }
    if (new Date() >= new Date(match.kickoff)) {
      return res.status(400).json({ error: 'Le match a déjà commencé' });
    }

    const prediction = await prisma.prediction.upsert({
      where: { userId_matchId: { userId, matchId: parseInt(matchId) } },
      update: { homeScorePred: parseInt(homeScorePred), awayScorePred: parseInt(awayScorePred) },
      create: {
        userId,
        matchId: parseInt(matchId),
        homeScorePred: parseInt(homeScorePred),
        awayScorePred: parseInt(awayScorePred),
      },
    });

    res.json(prediction);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * POST /api/predictions/joker — poser, déplacer ou retirer son joker.
 *
 * Corps : { matchId }. Un seul appel fait les trois : si le joker est déjà sur
 * ce match, il est retiré ; sinon il y est posé et enlevé de là où il était.
 * Un seul bouton côté écran, donc, et pas de question « poser ou déplacer ? »
 * à laquelle le joueur n'a pas envie de répondre.
 *
 * Les refus, et ce qu'ils protègent :
 *
 *  - journée antérieure à la mise en vigueur : les points d'avant ont été
 *    marqués sous d'autres règles ;
 *  - match de la semaine : il est déjà multiplié pour tout le monde, le joker
 *    doit aller ailleurs ;
 *  - match commencé : on ne mise pas sur un résultat qu'on regarde ;
 *  - **joker déjà engagé sur un match commencé** : c'est le refus qui compte.
 *    Sans lui, on poserait son joker sur le match de 14h30, on regarderait le
 *    score, et on le déplacerait si ça tourne mal. Le joker serait alors sans
 *    risque, donc sans intérêt ;
 *  - pas de pronostic enregistré sur ce match : un joker doit se poser sur un
 *    pari, pas sur une case vide.
 */
exports.setJoker = async (req, res) => {
  const userId = req.user.id;
  const matchId = parseInt(req.body.matchId, 10);
  if (!Number.isInteger(matchId)) {
    return res.status(400).json({ error: 'matchId requis' });
  }

  try {
    const match = await prisma.match.findUnique({ where: { id: matchId } });
    if (!match) return res.status(404).json({ error: 'Match introuvable' });

    if (match.round < DEPUIS) {
      return res.status(400).json({ error: `Le joker n'est actif qu'à partir de la J${DEPUIS}` });
    }

    const affiche = await afficheDe(match.round);
    if (affiche && affiche.id === match.id) {
      return res.status(400).json({
        error: 'Ce match est déjà le match de la semaine (×3) : garde ton joker pour un autre',
      });
    }

    const prediction = await prisma.prediction.findUnique({
      where: { userId_matchId: { userId, matchId } },
    });
    if (!prediction) {
      return res.status(400).json({ error: 'Enregistre d\'abord ton pronostic sur ce match' });
    }

    // Retrait : autorisé tant que ce match n'a pas commencé.
    if (prediction.joker) {
      if (new Date() >= new Date(match.kickoff)) {
        return res.status(400).json({ error: 'Ce match a commencé : ton joker y reste' });
      }
      const maj = await prisma.prediction.update({
        where: { id: prediction.id }, data: { joker: false },
      });
      return res.json({ joker: null, prediction: maj });
    }

    if (new Date() >= new Date(match.kickoff) || match.status !== 'SCHEDULED') {
      return res.status(400).json({ error: 'Ce match a déjà commencé' });
    }

    // Le joker de la journée, s'il est posé ailleurs.
    const ancien = await prisma.prediction.findFirst({
      where: { userId, joker: true, match: { round: match.round, season: SEASON } },
      include: { match: { select: { id: true, kickoff: true } } },
    });

    if (ancien && new Date() >= new Date(ancien.match.kickoff)) {
      return res.status(400).json({
        error: 'Ton joker est déjà engagé sur un match commencé : il ne peut plus être déplacé',
      });
    }

    // Les deux écritures vont ensemble : une panne entre les deux laisserait
    // le joueur avec deux jokers sur la journée, ou aucun.
    const ecritures = [];
    if (ancien) ecritures.push(prisma.prediction.update({ where: { id: ancien.id }, data: { joker: false } }));
    ecritures.push(prisma.prediction.update({ where: { id: prediction.id }, data: { joker: true } }));

    const resultats = await prisma.$transaction(ecritures);
    const maj = resultats[resultats.length - 1];

    res.json({ joker: matchId, deplaceDepuis: ancien ? ancien.match.id : null, prediction: maj });
  } catch (err) {
    console.error('[joker]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * GET /api/predictions/round/:round/regles — l'état des règles pour une journée.
 *
 * L'écran a besoin de trois choses pour se dessiner sans deviner : les
 * multiplicateurs sont-ils actifs, quel match est l'affiche, et où est mon
 * joker. Les calculer côté serveur évite que le navigateur redécouvre la règle
 * du « match qui commence le plus tard » — deux implémentations d'une même
 * règle finissent toujours par diverger.
 */
exports.getRoundRules = async (req, res) => {
  const round = parseInt(req.params.round, 10);
  try {
    const affiche = round >= DEPUIS ? await afficheDe(round) : null;
    const joker = await prisma.prediction.findFirst({
      where: { userId: req.user.id, joker: true, match: { round, season: SEASON } },
      select: { matchId: true },
    });
    res.json({
      round,
      actif: round >= DEPUIS,
      depuis: DEPUIS,
      afficheMatchId: affiche ? affiche.id : null,
      jokerMatchId: joker ? joker.matchId : null,
    });
  } catch (err) {
    console.error('[regles]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// GET /api/predictions/me?round=1 — mes pronostics
exports.getMyPredictions = async (req, res) => {
  const userId = req.user.id;
  const { round } = req.query;

  try {
    const where = { userId };
    if (round) {
      where.match = { round: parseInt(round) };
    }

    const predictions = await prisma.prediction.findMany({
      where,
      include: {
        match: { include: { homeTeam: true, awayTeam: true } },
      },
      orderBy: { match: { kickoff: 'asc' } },
    });
    res.json(predictions);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// GET /api/predictions/round/:round — tous les pronostics d'une journée
// Les pronostics sont visibles en permanence par tous les joueurs.
exports.getRoundPredictions = async (req, res) => {
  const { round } = req.params;

  try {
    const predictions = await prisma.prediction.findMany({
      where: { match: { round: parseInt(round) } },
      include: {
        user: { select: { id: true, username: true, avatarColor: true } },
        match: { include: { homeTeam: true, awayTeam: true } },
      },
      orderBy: [{ match: { kickoff: 'asc' } }, { user: { username: 'asc' } }],
    });

    res.json({ predictions, revealed: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// GET /api/predictions/match/:matchId — tous les pronostics d'un match
exports.getMatchPredictions = async (req, res) => {
  const { matchId } = req.params;

  try {
    const predictions = await prisma.prediction.findMany({
      where: { matchId: parseInt(matchId) },
      include: {
        user: { select: { id: true, username: true, avatarColor: true } },
      },
      orderBy: { user: { username: 'asc' } },
    });

    res.json(predictions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};
