const { PrismaClient } = require('@prisma/client');
const {
  stats, classerAvecPauses, retenuAuClassement, DEPUIS, DEPARTAGES,
} = require('../services/ranking');

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
        // Un joueur en pause reste dans la liste mais hors du classement. On lit
        // donc l'etat ici plutot que de filtrer dans la requete : il faut
        // pouvoir l'afficher grise, ce qu'une absence ne permettrait pas.
        enPause: true,
        predictions: {
          select: {
            points: true, basePoints: true, joker: true,
            homeScorePred: true, awayScorePred: true,
            // Les scores reels servent au quatrieme critere de departage, la
            // somme des ecarts.
            match: { select: { status: true, round: true, homeScore: true, awayScore: true } },
          },
        },
      },
    });

    const leaderboard = users.map((u) => {
      // Les journees anterieures a `DEPUIS` ne comptent pas : un seul joueur y
      // avait un compte, et son avance n'aurait pas pu etre disputee.
      const played = u.predictions.filter(
        (p) => p.match.status === 'FINISHED' && retenuAuClassement(p)
      );

      // Les quatre nombres du departage sont calcules par `ranking`, qui sert
      // aussi au classement d'une journee et au bilan du lundi. C'est la seule
      // facon de garantir que les trois rendent le meme ordre : le mail
      // triait autrement que le site, et personne ne l'avait vu.
      const s = stats(played);

      const base = (p) => (p.basePoints ?? p.points);
      const correctWinners = played.filter((p) => base(p) !== null && base(p) > 0).length;
      const jokers = played.filter((p) => p.joker).length;

      return {
        id: u.id,
        username: u.username,
        avatarColor: u.avatarColor,
        initials: u.initials,
        avatarRing: u.avatarRing,
        enPause: u.enPause,
        totalPoints: s.points,
        played: played.length,
        exactScores: s.exacts,
        correctWinners,
        jokers,
        accuracy: played.length ? Math.round((correctWinners / played.length) * 100) : 0,
        // Ce que le tri consomme. `ecarts` est aussi renvoye : l'ecran peut
        // vouloir expliquer une egalite, et il vaut mieux le lui donner que
        // le laisser deviner.
        ...s,
      };
    });

    // La reponse est un objet et non un tableau : `depuis` accompagne le
    // classement pour que l'ecran puisse expliquer d'ou il part sans redire la
    // regle de son cote. Un tableau ne pouvait pas le porter — JSON ignore les
    // proprietes non indicees d'un tableau, et la valeur disparaissait
    // silencieusement a la serialisation.
    res.json({
      classement: classerAvecPauses(leaderboard),
      depuis: DEPUIS,
      departages: DEPARTAGES,
    });
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
        user: {
          select: {
            id: true, username: true, avatarColor: true,
            initials: true, avatarRing: true, enPause: true,
          },
        },
        match: { select: { id: true, featured: true, homeScore: true, awayScore: true } },
      },
    });

    const parJoueur = new Map();
    for (const pred of predictions) {
      if (!parJoueur.has(pred.userId)) parJoueur.set(pred.userId, { user: pred.user, pronos: [] });
      parJoueur.get(pred.userId).pronos.push(pred);
    }

    // Meme departage qu'au general, par la meme fonction — et meme traitement
    // des joueurs en pause, qui figurent en bas de liste sans rang. Un joueur
    // qui s'est mis en pause en cours de saison a pu pronostiquer cette
    // journee-la : ses points sont donc reels et restent affiches.
    const lignes = [...parJoueur.values()].map(({ user, pronos }) => {
      const s = stats(pronos);
      const base = (p) => (p.basePoints ?? p.points);
      return {
        ...user,
        ...s,
        exactScores: s.exacts,
        correctWinners: pronos.filter((p) => base(p) > 0).length,
        joker: pronos.find((p) => p.joker)?.matchId ?? null,
      };
    });

    res.json(classerAvecPauses(lignes));
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};
