const { PrismaClient } = require('@prisma/client');
const { pointsFor } = require('../services/scoring');
const { multiplicateur, afficheDeLaJournee, journeeCommencee } = require('../services/rules');
const { forme, serie } = require('../services/team-stats.service');
const { rotations } = require('../services/compo-rotation.service');
const competitions = require('../services/competitions');

const prisma = new PrismaClient();

// GET /api/matches?round=1&season=2026-2027&competition=TOP14
//
// `competition` vaut le Top 14 par défaut : tous les appels existants du site
// continuent d'obtenir exactement la même réponse. Le Tournoi devra la demander
// explicitement.
exports.getMatches = async (req, res) => {
  const competition = competitions.lire(req.query.competition);
  // La saison par défaut dépend de la compétition : « 2026-2027 » pour le
  // championnat, « 2027 » pour le Tournoi. Un écran qui ne demande que la
  // compétition obtient donc la bonne saison sans avoir à la connaître.
  const { round, season = competitions.saison(competition) } = req.query;
  // La forme, les séries, le classement et les rotations sont des chiffres de
  // championnat, lus sur la LNR. Les demander pour le Tournoi rendrait au mieux
  // un bloc vide, au pire les chiffres d'un club sous le nom d'une nation.
  const chiffresClubs = competition === competitions.TOP14;
  try {
    const where = { season, competition };
    if (round) where.round = parseInt(round);

    const matches = await prisma.match.findMany({
      where,
      include: {
        homeTeam: true,
        awayTeam: true,
        predictions: req.user
          // `basePoints` et `joker` servent a l'affichage : l'etiquette se lit
          // sur le bareme, le total sur `points`. Sans eux la carte afficherait
          // « Rate » sur un score exact joue en joker.
          ? {
              where: { userId: req.user.id },
              select: {
                homeScorePred: true, awayScorePred: true,
                points: true, basePoints: true, joker: true,
              },
            }
          : false,
      },
      orderBy: [{ round: 'asc' }, { kickoff: 'asc' }],
    });

    // La forme des clubs accompagne les matchs d'une journee.
    //
    // Elle est attachee a chaque rencontre plutot que servie par un appel a part,
    // pour que la carte de match n'ait rien de plus a demander : une requete de
    // page, une reponse. Le cumul s'arrete a la journee **precedente**, sans quoi
    // la page de la J5 annoncerait une forme qui contient deja la J5.
    //
    // Sans journee demandee, on ne calcule rien : le calendrier general n'affiche
    // pas la forme, et une saison entiere multiplierait le travail par vingt-six
    // pour rien.
    let f = null;
    let s = null;
    let classement = null;
    if (round && chiffresClubs) {
      try {
        f = await forme({ season, avantRound: parseInt(round) });
      } catch (err) {
        // La forme est un agrement, pas la page : si elle echoue, les matchs
        // partent quand meme. Une rubrique manquante vaut mieux qu'une page
        // blanche.
        console.error('[matches] forme indisponible :', err.message);
      }

      /*
       * La serie des cinq derniers resultats, bornee comme la forme.
       *
       * Elle repond a ce que les moyennes cachent : le niveau sans la
       * dynamique. Trois defaites de suite ne se voyaient nulle part, alors
       * que c'est la premiere chose qu'on regarde dans un journal.
       */
      try {
        s = await serie({ season, avantRound: parseInt(round) });
      } catch (err) {
        console.error('[matches] serie indisponible :', err.message);
      }

      /*
       * Le classement, lu dans l'instantane deja en base.
       *
       * On ne le recalcule pas : c'est celui de la page Championnat, releve sur
       * la source officielle, et deux classements calcules differemment dans la
       * meme application finiraient par se contredire.
       *
       * Sa limite, et elle est assumee : cet instantane est celui d'aujourd'hui,
       * pas celui d'avant la journee affichee. Sur la journee a venir — le seul
       * moment ou l'on pose un pronostic — c'est exactement ce qu'il faut. En
       * rouvrant une journee passee, le rang affiche serait celui de maintenant,
       * d'ou la regle cote ecran : il ne s'affiche que sur une rencontre qui
       * n'a pas encore commence.
       */
      try {
        const snap = await prisma.leagueTable.findUnique({ where: { season } });
        if (snap?.data?.length) {
          classement = {};
          for (const ligne of snap.data) {
            if (ligne.teamId) {
              classement[ligne.teamId] = { rang: ligne.rank, points: ligne.points };
            }
          }
        }
      } catch (err) {
        console.error('[matches] classement indisponible :', err.message);
      }
    }

    /*
     * La rotation de chaque club : combien de titulaires ont change depuis sa
     * derniere composition connue.
     *
     * C'est la seule information que les compositions portaient sans qu'on
     * puisse la lire : il fallait retenir quarante-six noms d'une semaine sur
     * l'autre. Un club qui change neuf titulaires pour un deplacement annonce
     * son intention, et le chiffre le dit en trois mots.
     */
    let rot = null;
    if (round && chiffresClubs) {
      try {
        rot = await rotations({ season, round: parseInt(round) });
      } catch (err) {
        console.error('[matches] rotations indisponibles :', err.message);
      }
    }

    const cote = (id) => ({
      ...(f ? { ...(f[id] || {}) } : {}),
      serie: s ? (s[id] || []) : null,
      classement: classement ? (classement[id] || null) : null,
    });

    /*
     * Tout ce qui aide a decider voyage dans `forme`, sous les deux cotes.
     *
     * Les series et le classement auraient pu devenir deux champs de plus sur
     * la rencontre ; les ranger dans l'objet qui porte deja les moyennes evite
     * a la carte d'aller les chercher a trois endroits differents pour afficher
     * un seul bloc.
     */
    const avecForme = (m) => {
      if (!f && !s && !classement && !rot) return m;
      return {
        ...m,
        forme: { home: cote(m.homeTeamId), away: cote(m.awayTeamId) },
        // A cote de la composition qu'elle commente, et non dans `forme` : elle
        // ne parle pas du niveau du club mais de la feuille de match du jour.
        rotation: rot ? (rot[m.id] || null) : null,
      };
    };

    // Les compositions ne partent que si l'on a demande une journee.
    //
    // Une composition, c'est quarante-six joueurs ; sur une journee c'est
    // negligeable, sur une saison entiere ce serait la plus grosse part de la
    // reponse — pour quelque chose que personne ne regarde, l'appel sans journee
    // servant au calendrier general ou les quinze ne s'affichent pas.
    // `compositionAt` reste dans les deux cas : il suffit a dire qu'une
    // composition est annoncee.
    res.json(
      round
        ? matches.map(avecForme)
        : matches.map(({ composition, ...m }) => m)
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * GET /api/matches/rounds            — toutes les journees du calendrier
 * GET /api/matches/rounds?jouees=1   — seulement celles qui ont un resultat
 *
 * Le second sert au classement par journee : celui de la J20 en octobre est une
 * page vide, et proposer d'aller voir ce qui n'existe pas encore fait surtout
 * se demander si quelque chose est casse. Ailleurs — le calendrier, la saisie
 * des pronos — les vingt-six gardent tout leur sens, puisqu'on y va justement
 * pour ce qui n'a pas encore eu lieu.
 *
 * « Jouee » veut dire : au moins une rencontre terminee. Une journee etalee sur
 * deux week-ends apparait donc des le premier match homologue, ce qui est juste :
 * son classement partiel existe et se lit.
 */
exports.getRounds = async (req, res) => {
  try {
    // Les journées d'une seule compétition : sans ce filtre, les cinq journées
    // du Tournoi se fondraient dans les vingt-six du championnat.
    const competition = competitions.lire(req.query.competition);
    const rounds = await prisma.match.groupBy({
      by: ['round'],
      where: req.query.jouees === '1'
        ? { competition, status: 'FINISHED' }
        : { competition },
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

// GET /api/matches/teams — liste des clubs du championnat
//
// Les six nations du Tournoi sont dans la même table que les clubs. Cette liste
// sert aux écrans du championnat : elle ne garde donc que les équipes qui
// jouent au moins un match du Top 14, et la France n'y apparaît pas entre
// Clermont et La Rochelle.
exports.getTeams = async (req, res) => {
  try {
    const duTop14 = { some: { competition: competitions.TOP14 } };
    const teams = await prisma.team.findMany({
      where: { OR: [{ homeMatches: duTop14 }, { awayMatches: duTop14 }] },
      orderBy: { name: 'asc' },
    });
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
  const affiche = await estLAffiche(match);

  for (const pred of predictions) {
    // `basePoints` garde la valeur du bareme, de 0 a 3 ; `points` porte le
    // total multiplie. Les deux sont enregistres parce qu'ils repondent a deux
    // questions differentes : « combien ca rapporte » se somme au classement,
    // « le score etait-il exact » se compte sur le bareme. Sans la premiere
    // colonne, un score exact joue en joker vaudrait 6 et ne serait plus
    // reconnu comme un score exact.
    const basePoints = pointsFor(pred, match);
    const points = basePoints * multiplicateur({
      joker: pred.joker,
      affiche,
      round: match.round,
      // Sans elle, une rencontre du Tournoi passerait pour une journée de
      // championnat d'avant la J6, et ni joker ni affiche ne compteraient.
      competition: match.competition,
    });
    await prisma.prediction.update({ where: { id: pred.id }, data: { basePoints, points } });
  }
}

/**
 * Cette rencontre est-elle le match de la semaine ?
 *
 * On relit la journee entiere parce que la reponse depend des autres matchs :
 * l'affiche est celle qui commence le plus tard. Une requete de plus au moment
 * d'attribuer les points, c'est-a-dire quelques fois par week-end.
 *
 * Des que la journee a commence, on croit le champ `featured` ecrit en base
 * plutot que de recalculer : l'affiche doit etre figee, sinon un decalage
 * d'horaire la deplacerait apres que des joueurs ont place leur joker.
 */
async function estLAffiche(match) {
  const journee = await prisma.match.findMany({
    where: { round: match.round, season: match.season, competition: match.competition },
    select: { id: true, kickoff: true, featured: true },
  });
  if (!journee.length) return false;

  const a = journeeCommencee(journee)
    ? journee.find((m) => m.featured) || null
    : afficheDeLaJournee(journee);

  return !!a && a.id === match.id;
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

    // Le filtre le plus important de tout le passage au Tournoi. Sans lui, le
    // vendredi 5 février, le prochain coup d'envoi serait Irlande–Angleterre :
    // la journée renvoyée serait sa « J1 », et la page Mes pronos du Top 14
    // basculerait sur la première journée du championnat.
    const competition = competitions.lire(req.query.competition);

    const next = await prisma.match.findFirst({
      where: { competition, kickoff: { gt: now }, status: 'SCHEDULED' },
      orderBy: { kickoff: 'asc' },
      select: { round: true },
    });

    const started = await prisma.match.findFirst({
      where: { competition, kickoff: { lte: now } },
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
