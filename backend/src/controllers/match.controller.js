const { PrismaClient } = require('@prisma/client');
const { pointsFor } = require('../services/scoring');

const prisma = new PrismaClient();

// GET /api/matches?round=1&season=2026-2027
exports.getMatches = async (req, res) => {
  const { round, season = '2026-2027' } = req.query;
  try {
    const where = { season };
    if (round) where.round = parseInt(round);

    const matches = await prisma.match.findMany({
      where,
      include: {
        homeTeam: true,
        awayTeam: true,
        predictions: req.user
          ? { where: { userId: req.user.id }, select: { homeScorePred: true, awayScorePred: true, points: true } }
          : false,
      },
      orderBy: [{ round: 'asc' }, { kickoff: 'asc' }],
    });

    res.json(matches);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// GET /api/matches/rounds — liste des journées disponibles
exports.getRounds = async (req, res) => {
  try {
    const rounds = await prisma.match.groupBy({
      by: ['round'],
      orderBy: { round: 'asc' },
    });
    res.json(rounds.map((r) => r.round));
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// POST /api/matches — ajouter un match manuellement (admin simple)
exports.createMatch = async (req, res) => {
  const { homeTeamId, awayTeamId, kickoff, round, venue } = req.body;
  try {
    const match = await prisma.match.create({
      data: {
        homeTeamId: parseInt(homeTeamId),
        awayTeamId: parseInt(awayTeamId),
        kickoff: new Date(kickoff),
        round: parseInt(round),
        venue,
      },
      include: { homeTeam: true, awayTeam: true },
    });
    res.status(201).json(match);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// PATCH /api/matches/:id/result — saisir le résultat final
exports.updateResult = async (req, res) => {
  const { id } = req.params;
  const { homeScore, awayScore } = req.body;

  if (homeScore === undefined || awayScore === undefined) {
    return res.status(400).json({ error: 'homeScore et awayScore requis' });
  }

  try {
    const match = await prisma.match.update({
      where: { id: parseInt(id) },
      data: { homeScore: parseInt(homeScore), awayScore: parseInt(awayScore), status: 'FINISHED' },
    });

    // Calcul automatique des points pour tous les pronostics de ce match
    await calculatePoints(match);
    res.json(match);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// GET /api/matches/teams — liste des équipes
exports.getTeams = async (req, res) => {
  try {
    const teams = await prisma.team.findMany({ orderBy: { name: 'asc' } });
    res.json(teams);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * Attribue les points de tous les pronostics d'une rencontre.
 *
 * Le barème lui-même est dans `services/scoring.js` et pas ici. La raison est
 * la vérifiabilité : tant que la règle vivait dans cette boucle, la seule façon
 * de savoir combien vaut un prono 20-18 sur un 15-14 était d'avoir une base de
 * données, des pronostics enregistrés, et de lire le résultat après coup —
 * autrement dit, de jouer une journée. `pointsFor` prend deux couples de
 * nombres et rend un nombre ; `backend/test/scoring.test.js` la passe au
 * crible, frontière des cinq points et match nul compris.
 *
 * Cette fonction ne garde donc que ce qui lui appartient : lire les pronostics
 * et écrire les points.
 */
async function calculatePoints(match) {
  const predictions = await prisma.prediction.findMany({ where: { matchId: match.id } });

  for (const pred of predictions) {
    const points = pointsFor(pred, match);
    await prisma.prediction.update({ where: { id: pred.id }, data: { points } });
  }
}

/**
 * GET /api/matches/next-round
 *
 * round        : prochaine journée à pronostiquer, utilisée par la page Pronostics.
 * currentRound : journée en cours ou dernière jouée — celle du dernier match dont
 *                le coup d'envoi est passé. C'est ce qu'il faut afficher par défaut
 *                dans les résultats : le samedi soir on veut voir la journée du jour,
 *                pas la précédente.
 */
exports.getNextRound = async (req, res) => {
  try {
    const now = new Date();

    const next = await prisma.match.findFirst({
      where: { kickoff: { gt: now }, status: 'SCHEDULED' },
      orderBy: { kickoff: 'asc' },
      select: { round: true },
    });

    const started = await prisma.match.findFirst({
      where: { kickoff: { lte: now } },
      orderBy: { kickoff: 'desc' },
      select: { round: true },
    });

    res.json({
      round: next?.round ?? started?.round ?? 1,
      currentRound: started?.round ?? next?.round ?? 1,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

exports.calculatePoints = calculatePoints;
