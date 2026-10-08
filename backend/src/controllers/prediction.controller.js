const { PrismaClient } = require('@prisma/client');
const { DEPUIS, afficheDeLaJournee, journeeCommencee } = require('../services/rules');
const { pronostiquerJournee, avisJournee } = require('../services/bob.service');
const { forme } = require('../services/team-stats.service');
const { debutSemaine, choisirJournee } = require('../services/semaine');

const prisma = new PrismaClient();

const SEASON = process.env.SPORTSDB_SEASON || '2026-2027';

/**
 * Le plus haut score qu'on accepte.
 *
 * Deux cents n'a rien d'une regle du rugby : c'est une borne de bon sens. Le
 * record du Top 14 tourne autour de quatre-vingts points, et un pronostic a
 * 9 999 n'est pas une opinion sur un match, c'est un doigt qui a glisse ou
 * quelqu'un qui essaie l'API.
 */
const SCORE_MAX = 200;

/**
 * Jusqu'où devant soi Bob a le droit de pronostiquer.
 *
 * Deux journées d'avance, et pas une de plus. La borne n'est pas un quota : un
 * joueur peut appeler Bob toutes les semaines s'il le souhaite, et autant de
 * fois qu'il veut sur une même journée. Ce qu'elle interdit, c'est de prendre
 * de l'avance — de remplir la J12, la J15 et la J22 un dimanche de novembre,
 * puis de ne plus revenir de la saison.
 *
 * C'est la bonne borne parce qu'elle touche exactement ce qu'on veut empêcher.
 * Un quota de deux journées par saison punissait aussi le joueur qui, chaque
 * semaine, est juste en retard d'un quart d'heure — c'est-à-dire le cas pour
 * lequel Bob existe. Ici, celui-là n'est jamais gêné : la journée en cours est
 * toujours ouverte.
 *
 * Et elle se défend toute seule, sans rien stocker. Il n'y a pas de compteur à
 * tenir, pas de table à migrer, pas d'historique qui puisse dire qui a appelé
 * Bob et quand — ce qui règle du même coup la question de la discrétion : il
 * n'existe nulle part de trace à laisser fuir.
 *
 * Le repère est la journée de la semaine, celle que le site affiche par défaut,
 * et non la dernière jouée : c'est celle que le joueur a sous les yeux quand il
 * appuie sur le bouton.
 */
const BOB_AVANCE_MAX = 2;

/**
 * Lit un score, ou rend `null` s'il n'en est pas un.
 *
 * L'ancienne verification laissait passer trop de choses. « abc » n'est ni
 * `undefined` ni inferieur a zero : il franchissait les deux tests, arrivait a
 * `parseInt` sous la forme `NaN`, et c'est Prisma qui finissait par lever — le
 * joueur recevait une erreur serveur 500 pour une faute de saisie. Une valeur
 * qu'on ne comprend pas merite un refus lisible, pas une panne.
 *
 * `Number` plutot que `parseInt` : `parseInt('12abc')` rend 12, ce qui accepte
 * une saisie a moitie fausse en faisant semblant de l'avoir comprise. `Number`
 * rend `NaN` et refuse franchement. Et `Number.isInteger` ecarte 12.5, qu'aucun
 * score de rugby ne justifie.
 *
 * Le controle de type en tete n'est pas de la coquetterie : `Number(true)` vaut
 * 1, `Number([])` vaut 0 et `Number([5])` vaut 5. Sans lui, envoyer `true`
 * enregistrerait un pronostic a 1 point, et un tableau vide un 0-0. Ce sont des
 * valeurs qu'aucun ecran n'envoie, mais une API accepte ce qu'on lui donne, pas
 * ce qu'on avait prevu de lui donner.
 */
function lireScore(v) {
  if (typeof v !== 'number' && typeof v !== 'string') return null;
  if (v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= SCORE_MAX ? n : null;
}

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

/**
 * La journée de la semaine — le repère de l'avance autorisée.
 *
 * C'est le même calcul que `getNextRound` dans `match.controller.js` : la
 * semaine commence le mercredi à minuit, heure de Paris, et la journée affichée
 * est celle dont un match tombe dans la semaine en cours ; à défaut, la dernière
 * commencée ; à défaut, la prochaine.
 *
 * La règle elle-même n'est pas réécrite ici — `debutSemaine` et `choisirJournee`
 * vivent dans `semaine.js` et sont testées là-bas. Ce qui est repris, ce sont
 * les trois requêtes qui vont les chercher en base, et c'est une duplication que
 * je n'aime pas : deux endroits qui posent la même question finissent par y
 * répondre différemment. Le bon geste serait de remonter ces trois requêtes dans
 * `semaine.js` et de faire appeler les deux contrôleurs — colle-moi
 * `semaine.js` et `match.controller.js` et je le fais proprement.
 */
async function journeeDeLaSemaine(maintenant = new Date()) {
  const debut = debutSemaine(maintenant);
  const fin = new Date(debut.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [semaine, commencee, prochaine] = await Promise.all([
    prisma.match.findFirst({
      where: { season: SEASON, kickoff: { gte: debut, lt: fin } },
      orderBy: { kickoff: 'asc' },
      select: { round: true },
    }),
    prisma.match.findFirst({
      where: { season: SEASON, kickoff: { lte: maintenant } },
      orderBy: { kickoff: 'desc' },
      select: { round: true },
    }),
    prisma.match.findFirst({
      where: { season: SEASON, kickoff: { gt: maintenant } },
      orderBy: { kickoff: 'asc' },
      select: { round: true },
    }),
  ]);

  return choisirJournee({
    semaine: semaine?.round,
    derniere: commencee?.round,
    prochaine: prochaine?.round,
  });
}

/**
 * Bob a-t-il le droit d'intervenir sur cette journée ?
 *
 * Une seule question, posée au même endroit pour l'écran et pour l'écriture :
 * `getRoundRules` s'en sert pour griser le bouton, `lancerBob` pour refuser. Un
 * contrôle qui accepte puis se fait refuser est pire qu'un bouton inactif qui
 * s'explique — mais c'est bien le serveur qui tranche dans les deux cas.
 */
async function bobAutorise(round, maintenant = new Date()) {
  const semaine = await journeeDeLaSemaine(maintenant);
  return {
    semaine,
    limite: semaine + BOB_AVANCE_MAX,
    ok: Number.isInteger(round) && round <= semaine + BOB_AVANCE_MAX,
  };
}

/**
 * POST /api/predictions/bob — Bob le poulpe remplit la journée.
 *
 * Corps : `{ round }`. Il remplit les cases vides des matchs encore ouverts et
 * pose un joker au hasard si le joueur n'en a pas. Les scores écrits sont des
 * pronostics comme les autres : modifiables case par case ensuite, et rien ne
 * les distingue à l'écran ni dans les mails.
 *
 * On peut l'appeler autant qu'on veut. La seule borne est l'avance : pas plus de
 * deux journées devant celle de la semaine (voir `BOB_AVANCE_MAX`). Rien n'est
 * enregistré de ces appels — ni compteur, ni date, ni marque sur les pronostics.
 *
 * Trois points méritent d'être dits ici plutôt que devinés plus tard.
 *
 * **Les matchs passés sont écartés avant le calcul.** Bob ne reçoit que les
 * rencontres `SCHEDULED` dont le coup d'envoi est devant nous, exactement comme
 * `upsertPrediction` les accepte. Un joueur qui appelle Bob le dimanche soir
 * obtient donc les matchs qui restent, pas un pronostic sur un score affiché à
 * la télévision — et ce filtre est ici, dans la requête, plutôt que dans
 * `bob.service.js` : une règle, un endroit.
 *
 * **La forme est bornée à `avantRound: round`.** C'est la même borne que la
 * carte de match affiche, donc Bob calcule sur les chiffres que le joueur a sous
 * les yeux. S'il calculait sur la saison entière, il verrait des résultats
 * postérieurs en rouvrant une journée passée, et ses scores paraîtraient
 * inexplicablement bons.
 *
 * **Tout part en une transaction.** Les sept pronostics et le joker vont
 * ensemble. Une panne au milieu laisserait sinon un joueur avec six scores sur
 * sept, dont un joker posé sur une rencontre dépourvue de pronostic — un état
 * que `setJoker` refuse de créer et qu'il ne faut pas pouvoir atteindre par
 * l'autre porte.
 */
exports.lancerBob = async (req, res) => {
  const userId = req.user.id;
  const round = parseInt(req.body.round, 10);
  if (!Number.isInteger(round)) {
    return res.status(400).json({ error: 'round requis' });
  }

  const maintenant = new Date();

  try {
    const avance = await bobAutorise(round, maintenant);
    if (!avance.ok) {
      return res.status(403).json({
        error: `Bob ne pronostique pas au-delà de la J${avance.limite} : pas plus de ${BOB_AVANCE_MAX} journées d'avance`,
        bobLimite: avance.limite,
      });
    }

    const matchs = await prisma.match.findMany({
      where: {
        round,
        season: SEASON,
        status: 'SCHEDULED',
        kickoff: { gt: maintenant },
      },
      select: { id: true, homeTeamId: true, awayTeamId: true },
      orderBy: { kickoff: 'asc' },
    });

    if (!matchs.length) {
      return res.status(400).json({ error: 'Plus aucun match ouvert sur cette journée' });
    }

    const [miennes, affiche, formeClubs] = await Promise.all([
      prisma.prediction.findMany({
        where: { userId, matchId: { in: matchs.map((m) => m.id) } },
        select: { id: true, matchId: true, joker: true },
      }),
      round >= DEPUIS ? afficheDe(round) : Promise.resolve(null),
      forme({ season: SEASON, avantRound: round }),
    ]);

    // Un joker posé ailleurs sur la journée compte aussi, même si son match a
    // déjà commencé : Bob n'a pas à en poser un second.
    const jokerAilleurs = await prisma.prediction.findFirst({
      where: { userId, joker: true, match: { round, season: SEASON } },
      select: { matchId: true },
    });

    const parMatch = new Map(miennes.map((p) => [p.matchId, p]));

    const { pronostics, jokerMatchId } = pronostiquerJournee({
      matchs: matchs.map((m) => ({
        ...m,
        dejaPronostique: parMatch.has(m.id),
        estAffiche: !!affiche && affiche.id === m.id,
      })),
      forme: formeClubs,
      jokerDejaPose: !!jokerAilleurs,
      jokerActif: round >= DEPUIS,
    });

    // `upsert` plutôt que `create`, avec une mise à jour qui ne touche aucun
    // score. Deux clics rapprochés sur le bouton — le doigt qui ripe, la
    // connexion qui traîne — font partir deux requêtes qui voient toutes les
    // deux la case vide. Avec `create`, la seconde casse sur la contrainte
    // d'unicité et annule toute la transaction ; ici elle ne fait rien. Et
    // `update` laisse délibérément les scores en place : la promesse « Bob ne
    // remplit que les cases vides » tient même quand deux requêtes se croisent.
    const ecritures = pronostics.map((p) =>
      prisma.prediction.upsert({
        where: { userId_matchId: { userId, matchId: p.matchId } },
        update: { joker: p.matchId === jokerMatchId ? true : undefined },
        create: {
          userId,
          matchId: p.matchId,
          homeScorePred: p.homeScorePred,
          awayScorePred: p.awayScorePred,
          joker: p.matchId === jokerMatchId,
        },
      }),
    );

    // Le joker peut tomber sur un match que le joueur avait déjà pronostiqué :
    // la ligne existe, il n'y a qu'à la marquer.
    if (jokerMatchId && !pronostics.some((p) => p.matchId === jokerMatchId)) {
      const existante = parMatch.get(jokerMatchId);
      if (existante) {
        ecritures.push(
          prisma.prediction.update({ where: { id: existante.id }, data: { joker: true } }),
        );
      }
    }

    await prisma.$transaction(ecritures);

    res.json({ round, remplis: pronostics.length, jokerMatchId });
  } catch (err) {
    console.error('[bob]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// POST /api/predictions — soumettre / mettre à jour un pronostic
exports.upsertPrediction = async (req, res) => {
  const { matchId, homeScorePred, awayScorePred } = req.body;
  const userId = req.user.id;

  if (homeScorePred === undefined || awayScorePred === undefined || !matchId) {
    return res.status(400).json({ error: 'matchId, homeScorePred et awayScorePred requis' });
  }

  const home = lireScore(homeScorePred);
  const away = lireScore(awayScorePred);
  if (home === null || away === null) {
    return res.status(400).json({
      error: `Les scores doivent être des nombres entiers, entre 0 et ${SCORE_MAX}`,
    });
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
      update: { homeScorePred: home, awayScorePred: away },
      create: {
        userId,
        matchId: parseInt(matchId),
        homeScorePred: home,
        awayScorePred: away,
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
 * GET /api/predictions/round/:round/avis — ce que Bob pense de mes pronostics.
 *
 * Ne lit rien d'autre que les pronostics du demandeur, et n'écrit rien du tout.
 * Un joueur ne peut donc pas s'en servir pour savoir ce que Bob pense de la
 * grille d'un autre.
 *
 * Aucune borne d'avance ici, contrairement au remplissage : commenter des
 * pronostics qu'on a déjà posés ne permet pas de prendre de l'avance, puisque
 * c'est déjà fait. Et aucune borne de temps non plus — on peut demander son avis
 * à Bob après coup sur une journée finie, ce qui est au fond le moment le plus
 * drôle.
 *
 * La forme est bornée à `avantRound`, comme ailleurs : Bob juge avec ce qu'on
 * savait avant la journée, pas avec les résultats de la journée elle-même. Sans
 * cette borne, rouvrir une J3 en avril ferait de lui un génie rétrospectif.
 */
exports.avisBob = async (req, res) => {
  const round = parseInt(req.params.round, 10);
  if (!Number.isInteger(round)) return res.status(400).json({ error: 'round invalide' });

  try {
    const matchs = await prisma.match.findMany({
      where: { round, season: SEASON },
      select: { id: true, homeTeamId: true, awayTeamId: true },
      orderBy: { kickoff: 'asc' },
    });
    if (!matchs.length) return res.json({ round, lignes: [], verdict: null });

    const [miennes, formeClubs] = await Promise.all([
      prisma.prediction.findMany({
        where: { userId: req.user.id, matchId: { in: matchs.map((m) => m.id) } },
        select: { matchId: true, homeScorePred: true, awayScorePred: true },
      }),
      forme({ season: SEASON, avantRound: round }),
    ]);

    const pronostics = Object.fromEntries(miennes.map((p) => [p.matchId, p]));
    const avis = avisJournee({ matchs, forme: formeClubs, pronostics });

    res.json({ round, ...avis });
  } catch (err) {
    console.error('[bob:avis]', err);
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
 *
 * S'y ajoute l'avance autorisée à Bob, pour la même raison. Le bouton doit
 * savoir **avant** le clic s'il a le droit d'agir sur cette journée-là :
 * découvrir le refus après coup serait apprendre la règle de la mauvaise façon.
 * Deux champs suffisent — le droit sur cette journée, et la dernière journée
 * ouverte, qui permet de l'expliquer en une phrase.
 */
exports.getRoundRules = async (req, res) => {
  const round = parseInt(req.params.round, 10);
  try {
    const affiche = round >= DEPUIS ? await afficheDe(round) : null;
    const joker = await prisma.prediction.findFirst({
      where: { userId: req.user.id, joker: true, match: { round, season: SEASON } },
      select: { matchId: true },
    });
    const bob = await bobAutorise(round);
    res.json({
      round,
      actif: round >= DEPUIS,
      depuis: DEPUIS,
      afficheMatchId: affiche ? affiche.id : null,
      jokerMatchId: joker ? joker.matchId : null,
      bobOk: bob.ok,
      bobLimite: bob.limite,
      bobAvanceMax: BOB_AVANCE_MAX,
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
