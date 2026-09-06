const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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

// GET /api/predictions/round/:round — tous les pronostics d'une journée (après clôture)
exports.getRoundPredictions = async (req, res) => {
  const { round } = req.params;

  try {
    // Ne montrer les pronostics des autres qu'après le début du 1er match de la journée
    const firstMatch = await prisma.match.findFirst({
      where: { round: parseInt(round) },
      orderBy: { kickoff: 'asc' },
    });

    const reveal = !firstMatch || new Date() >= new Date(firstMatch.kickoff);

    const predictions = await prisma.prediction.findMany({
      where: { match: { round: parseInt(round) } },
      include: {
        user: { select: { id: true, username: true, avatarColor: true } },
        match: { include: { homeTeam: true, awayTeam: true } },
      },
    });

    res.json({ predictions, revealed: reveal });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};
