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
        initials: true,
        avatarRing: true,
        predictions: {
          select: {
            points: true, basePoints: true, joker: true,
            homeScorePred: true, awayScorePred: true,
            match: { select: { status: true } },
          },
        },
      },
    });

    const leaderboard = users.map((u) => {
      const played = u.predictions.filter((p) => p.match.status === 'FINISHED');
      const totalPoints = played.reduce((sum, p) => sum + (p.points || 0), 0);

      // Les statistiques se comptent sur le bareme (`basePoints`), jamais sur
      // le total : un score exact joue en joker vaut 6 points et ne serait plus
      // reconnu comme un score exact si on testait `points === 3`.
      //
      // Le repli sur `points` couvre les pronostics d'avant l'introduction des
      // multiplicateurs, dont `basePoints` est nul : a cette epoque les deux
      // valeurs etaient egales, la lecture reste donc juste.
      const base = (p) => (p.basePoints ?? p.points);
      const exactScores = played.filter((p) => base(p) === 3).length;
      const correctWinners = played.filter((p) => base(p) !== null && base(p) > 0).length;
      const jokers = played.filter((p) => p.joker).length;

      return {
        id: u.id,
        username: u.username,
        avatarColor: u.avatarColor,
        initials: u.initials,
        avatarRing: u.avatarRing,
        totalPoints,
        played: played.length,
        exactScores,
        correctWinners,
        jokers,
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
      include: {
        user: { select: { id: true, username: true, avatarColor: true, initials: true, avatarRing: true } },
        match: { select: { id: true, featured: true } },
      },
    });

    const byUser = {};
    for (const pred of predictions) {
      if (!byUser[pred.userId]) {
        byUser[pred.userId] = { ...pred.user, points: 0, exactScores: 0, correctWinners: 0, joker: null };
      }
      // Comme au general : le total se somme sur `points`, les statistiques se
      // comptent sur le bareme.
      const base = pred.basePoints ?? pred.points;
      byUser[pred.userId].points += pred.points || 0;
      if (base === 3) byUser[pred.userId].exactScores++;
      if (base > 0) byUser[pred.userId].correctWinners++;
      if (pred.joker) byUser[pred.userId].joker = pred.matchId;
    }

    const ranking = Object.values(byUser).sort((a, b) => b.points - a.points);
    res.json(ranking);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};
