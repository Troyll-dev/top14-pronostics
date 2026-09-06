const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// GET /api/leaderboard — classement général
exports.getLeaderboard = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        avatarColor: true,
        predictions: {
          select: { points: true, homeScorePred: true, awayScorePred: true, match: { select: { status: true } } },
        },
      },
    });

    const leaderboard = users.map((u) => {
      const played = u.predictions.filter((p) => p.match.status === 'FINISHED');
      const totalPoints = played.reduce((sum, p) => sum + (p.points || 0), 0);
      const exactScores = played.filter((p) => p.points === 3).length;
      const correctWinners = played.filter((p) => p.points !== null && p.points > 0).length;

      return {
        id: u.id,
        username: u.username,
        avatarColor: u.avatarColor,
        totalPoints,
        played: played.length,
        exactScores,
        correctWinners,
        accuracy: played.length ? Math.round((correctWinners / played.length) * 100) : 0,
      };
    });

    leaderboard.sort((a, b) => b.totalPoints - a.totalPoints || b.exactScores - a.exactScores);
    res.json(leaderboard);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// GET /api/leaderboard/round/:round — classement d'une journée spécifique
exports.getRoundLeaderboard = async (req, res) => {
  const { round } = req.params;

  try {
    const predictions = await prisma.prediction.findMany({
      where: { match: { round: parseInt(round), status: 'FINISHED' } },
      include: { user: { select: { id: true, username: true, avatarColor: true } } },
    });

    const byUser = {};
    for (const pred of predictions) {
      if (!byUser[pred.userId]) {
        byUser[pred.userId] = { ...pred.user, points: 0, exactScores: 0, correctWinners: 0 };
      }
      byUser[pred.userId].points += pred.points || 0;
      if (pred.points === 3) byUser[pred.userId].exactScores++;
      if (pred.points > 0) byUser[pred.userId].correctWinners++;
    }

    const ranking = Object.values(byUser).sort((a, b) => b.points - a.points);
    res.json(ranking);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};
