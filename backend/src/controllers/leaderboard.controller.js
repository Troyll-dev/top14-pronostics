const { PrismaClient } = require('@prisma/client');
const {
  stats, classerAvecPauses, retenuDepuis, DEPUIS, DEPUIS_TOUS, DEPARTAGES,
} = require('../services/ranking');
const series = require('../services/series.service');
const { TOP14, lire, saison } = require('../services/competitions');

const prisma = new PrismaClient();

/**
 * GET /api/leaderboard          — le general, depuis la J3
 * GET /api/leaderboard?depuis=5 — depuis que tout le monde est inscrit
 *
 * Un seul calcul, deux seuils. Le parametre est borne a un entier raisonnable :
 * il vient de l'adresse, donc de n'importe qui, et un seuil absurde ne doit pas
 * rendre un classement absurde — il rendrait surtout un classement vide, que
 * personne ne saurait expliquer.
 */
exports.getLeaderboard = async (req, res) => {
  /*
   * Deux classements, un par compétition, chacun avec ses pronostics.
   *
   * Les seuils sont ceux du championnat — la J3 pour le général, la J5 pour
   * « tout le monde inscrit » — parce qu'ils réparent l'histoire de sa saison :
   * un seul joueur au début, les autres arrivés ensuite. Le Tournoi n'a pas
   * cette histoire. Tout le monde y part de zéro le même jour : il compte dès
   * sa J1, et le second onglet n'a pas de sens.
   */
  const competition = lire(req.query.competition);
  const tournoi = competition !== TOP14;
  const demande = parseInt(req.query.depuis, 10);
  const seuil = tournoi
    ? 1
    : Number.isInteger(demande) && demande >= 1 && demande <= 26 ? demande : DEPUIS;
  const retenu = retenuDepuis(seuil);

  try {
    const users = await prisma.user.findMany({
      /*
       * Les comptes qui ne sont pas tenus par une personne n'entrent pas dans le
       * classement. Il n'y en a qu'un — Bob, qui signe le message de bienvenue
       * au Comptoir — et il n'a aucun pronostic : sans ce filtre il figurerait
       * en bas de liste avec zero point, ce qui ferait croire a un copain qui
       * n'a jamais joue.
       *
       * Le filtre est ici et non dans le calcul, contrairement a `enPause` : un
       * joueur en pause doit rester visible, grise ; un robot ne doit pas
       * apparaitre du tout.
       */
      where: { bot: false },
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
        // Les pronostics du championnat seulement.
        //
        // Ce classement prenait tous les pronostics d'un joueur, quels qu'ils
        // soient — ce qui revenait au même tant qu'il n'existait qu'une
        // compétition. Avec le Tournoi, un score exact sur France–Galles se
        // serait ajouté au total du Top 14, et le classement du championnat
        // aurait bougé un samedi de février sans qu'un match de Top 14 soit
        // joué. Le Tournoi aura son propre classement.
        predictions: {
          where: { match: { competition } },
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
        (p) => p.match.status === 'FINISHED' && retenu(p)
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
    /**
     * La serie de journees gagnees s'ajoute apres le classement : elle ne change
     * pas l'ordre, elle le commente.
     *
     * Deux formulations accompagnent chaque ligne. `phrases` parle du joueur a
     * la troisieme personne, pour le classement ou on lit les autres.
     * `phrasesPourToi` tutoie, et n'est posee que sur la ligne de celui qui
     * demande — l'accueil et le bilan du lundi s'adressent a lui.
     *
     * Elles sont fabriquees au meme endroit que les nombres qu'elles decrivent.
     * Trois ecrans qui reformuleraient chacun les memes chiffres finiraient par
     * se contredire, comme l'ont fait le site et le bilan sur le departage.
     */
    const classe = classerAvecPauses(leaderboard);
    // Les séries de journées gagnées se comptent dans la compétition affichée :
    // gagner la J14 du Top 14 ne prolonge pas une série du Tournoi.
    const parSerie = await series.pourTous({ season: saison(competition) });

    const enrichi = classe.map((l) => {
      const avecSerie = { ...l, serie: parSerie.get(l.id) || null };
      return {
        ...avecSerie,
        phrases: series.phrases(avecSerie, { pourSoi: false }),
        ...(req.user && req.user.id === l.id
          ? { phrasesPourToi: series.phrases(avecSerie, { pourSoi: true }) }
          : {}),
      };
    });

    res.json({
      classement: enrichi,
      depuis: seuil,
      // La journee ou tout le monde etait la, pour que l'ecran sache proposer
      // le second onglet sans avoir a la connaitre de son cote.
      depuisTous: tournoi ? null : DEPUIS_TOUS,
      competition,
      departages: DEPARTAGES,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/*
 * GET /api/leaderboard/round/:round — classement d'une journee specifique
 *
 * Pas de filtre sur les robots ici, et ce n'est pas un oubli : ce classement
 * part des pronostics et non des comptes. Bob n'en pose aucun, il ne peut donc
 * pas y apparaitre.
 */
exports.getRoundLeaderboard = async (req, res) => {
  const { round } = req.params;
  // Une journée se désigne par sa compétition et son numéro.
  const competition = lire(req.query.competition);

  try {
    const predictions = await prisma.prediction.findMany({
      where: { match: { competition, round: parseInt(round), status: 'FINISHED' } },
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
