const { PrismaClient } = require('@prisma/client');
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

// Calcul des points après résultat
async function calculatePoints(match) {
  const predictions = await prisma.prediction.findMany({ where: { matchId: match.id } });

  for (const pred of predictions) {
    let points = 0;
    const predWinner = Math.sign(pred.homeScorePred - pred.awayScorePred);
    const realWinner = Math.sign(match.homeScore - match.awayScore);
    const exactScore =
      pred.homeScorePred === match.homeScore && pred.awayScorePred === match.awayScore;

    if (exactScore) {
      points = 3; // Score exact
    } else if (predWinner === realWinner) {
      // Bon vainqueur : bonus si écart prédit proche de l'écart réel (≤5 pts)
      const predDiff = Math.abs(pred.homeScorePred - pred.awayScorePred);
      const realDiff = Math.abs(match.homeScore - match.awayScore);
      points = Math.abs(predDiff - realDiff) <= 5 ? 2 : 1;
    }

    await prisma.prediction.update({ where: { id: pred.id }, data: { points } });
  }
}
