/**
 * Que vaut Bob ? — rejoue plusieurs stratégies sur les journées déjà jouées.
 *
 *   node scripts/bob-backtest.js
 *
 * À lancer depuis `backend/`. Ne modifie rien, n'écrit nulle part, n'envoie
 * aucun courriel : il lit la base et imprime deux tableaux.
 *
 * ---------------------------------------------------------------------------
 * CE QUE LA PREMIÈRE MESURE A APPRIS, ET POURQUOI ELLE NE SUFFISAIT PAS
 * ---------------------------------------------------------------------------
 *
 * Première version, sur 35 matchs de production : Bob 26 points, la variante
 * domicile/extérieur 28, « parier 27-21 à chaque match » 27, « parier 24-23 »
 * 26, et la moyenne des copains 21.9. Soit, pour tout le monde, entre 0.74 et
 * 0.80 point par match sur 3 possibles.
 *
 * Deux enseignements. D'abord, deux points d'écart sur 35 matchs, c'est un seul
 * résultat qui bascule : les quatre stratégies sont indiscernables, et dire
 * que l'une bat l'autre serait lire un classement dans du bruit. Ensuite, et
 * c'est le plus instructif, personne n'atteint jamais la barre des 2 points.
 * Le score exact est hors de portée, la fourchette à cinq points près presque
 * autant : ce qui se joue réellement, à chaque match, c'est un point pour avoir
 * désigné le vainqueur.
 *
 * Mesurer des points, dans ces conditions, revient donc à mesurer le taux de
 * bons vainqueurs à travers un filtre bruité par deux cas rares. Autant
 * mesurer la chose directement.
 *
 * ---------------------------------------------------------------------------
 * CE QUE CETTE VERSION MESURE
 * ---------------------------------------------------------------------------
 *
 * Le taux de bons vainqueurs de chaque stratégie, en plus des points.
 *
 * C'est une proportion sur 35 tirages au lieu d'une somme qui dépend de
 * coïncidences : beaucoup plus stable, et directement comparable d'une
 * stratégie à l'autre. L'ordre de grandeur de l'incertitude est rappelé en bas
 * du tableau — sur 35 matchs, elle vaut environ huit points de pourcentage,
 * ce qui veut dire que deux stratégies séparées de moins de cela sont à
 * égalité, même si l'une affiche un plus joli chiffre.
 *
 * Et deux stratégies candidates viennent s'ajouter aux quatre d'origine :
 *
 *   « classement » — le mieux classé gagne. C'est ce que fait un humain qui ne
 *   suit pas la saison de près, et c'est le concurrent le plus sérieux : si
 *   Bob ne le bat pas, sa formule n'apporte rien que le classement ne dise
 *   déjà. Le classement est reconstruit avant chaque journée à partir des
 *   seules rencontres antérieures : 4 points la victoire, 2 le nul, 1 le bonus
 *   défensif à cinq points près. Le bonus offensif manque — il demande le
 *   nombre d'essais, que la base ne contient pas — donc ce classement n'est
 *   pas exactement celui de la LNR. À cet usage-là, départager deux clubs,
 *   l'écart est négligeable.
 *
 *   « elo » — un classement qui s'ajuste match par match. Chaque club porte
 *   une note, le vainqueur prend des points au vaincu, et battre un gros
 *   rapporte plus que battre un petit. C'est la méthode de référence pour
 *   prédire un vainqueur, et elle a sur un classement l'avantage de tenir
 *   compte de la qualité de l'adversaire rencontré — un club à six victoires
 *   contre les six derniers n'est pas un club à six victoires contre les six
 *   premiers. L'avantage du terrain n'est pas écrit en dur : il est déduit des
 *   rencontres déjà jouées, et lui aussi recalculé avant chaque journée.
 *
 * Ces deux-là ne pronostiquent qu'un vainqueur, pas un score. Pour entrer dans
 * la colonne des points il leur faut quand même un score : on leur donne
 * 27-21 en faveur de leur favori, c'est-à-dire le même score que la stratégie
 * « domicile ». Leur colonne « points » n'est donc qu'une conséquence de leur
 * taux de bons vainqueurs ; c'est la colonne de gauche qu'il faut lire.
 *
 * ---------------------------------------------------------------------------
 * LA RÈGLE QUI REND LA MESURE HONNÊTE
 * ---------------------------------------------------------------------------
 *
 * Pour pronostiquer la journée 5, on ne se sert que des journées 1 à 4.
 *
 * C'est tout l'enjeu d'un test de ce genre, et c'est aussi la façon la plus
 * facile de se tromper : si l'on calcule les moyennes des clubs sur la saison
 * entière puis qu'on rejoue la journée 3 avec, on utilise des matchs qui
 * n'avaient pas encore eu lieu. Le résultat paraît excellent et ne veut rien
 * dire — l'algorithme a lu la fin du livre.
 *
 * Moyennes, classement, notes Elo et avantage du terrain sont donc tous
 * recalculés avant chaque journée, à partir des seules rencontres antérieures.
 * La journée 1 est exclue du total : personne, humain ou machine, n'a de
 * statistiques à ce moment-là.
 */

const { PrismaClient } = require('@prisma/client');
const bob = require('../src/services/bob.service');

const prisma = new PrismaClient();

/* -------------------------------------------------------------------------- */
/* Le barème                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Trois pour le score exact, deux pour le bon vainqueur à cinq points près des
 * deux côtés, un pour le bon vainqueur, zéro sinon. On ne compte ni le joker ni
 * l'affiche : ce sont des multiplicateurs de pari, pas de justesse, et les
 * inclure comparerait des stratégies de mise au lieu de comparer des pronostics.
 */
const ECART_PROCHE = 5;

const vainqueur = (h, a) => (h > a ? 'dom' : a > h ? 'ext' : 'nul');

function points(predH, predA, reelH, reelA) {
  if (predH === reelH && predA === reelA) return 3;
  if (vainqueur(predH, predA) !== vainqueur(reelH, reelA)) return 0;
  const proche =
    Math.abs(predH - reelH) <= ECART_PROCHE && Math.abs(predA - reelA) <= ECART_PROCHE;
  return proche ? 2 : 1;
}

/* -------------------------------------------------------------------------- */
/* Ce que l'on sait avant une journée                                         */
/* -------------------------------------------------------------------------- */

/**
 * Les moyennes de chaque club, calculées sur les rencontres fournies.
 *
 * Rend trois jeux de chiffres par club : toutes rencontres confondues — ce dont
 * Bob se sert aujourd'hui —, à domicile, et à l'extérieur. Les deux derniers
 * alimentent la variante.
 */
function moyennes(matchs) {
  const acc = {};
  const init = () => ({ n: 0, pour: 0, contre: 0, nDom: 0, pourDom: 0, contreDom: 0, nExt: 0, pourExt: 0, contreExt: 0 });

  for (const m of matchs) {
    const d = (acc[m.homeTeamId] ||= init());
    const e = (acc[m.awayTeamId] ||= init());

    d.n++; d.pour += m.homeScore; d.contre += m.awayScore;
    d.nDom++; d.pourDom += m.homeScore; d.contreDom += m.awayScore;

    e.n++; e.pour += m.awayScore; e.contre += m.homeScore;
    e.nExt++; e.pourExt += m.awayScore; e.contreExt += m.homeScore;
  }

  const stats = {};
  for (const [id, a] of Object.entries(acc)) {
    stats[id] = {
      joues: a.n,
      pointsPourParMatch: a.n ? a.pour / a.n : null,
      pointsContreParMatch: a.n ? a.contre / a.n : null,
      domicile: a.nDom
        ? { pour: a.pourDom / a.nDom, contre: a.contreDom / a.nDom, n: a.nDom }
        : null,
      exterieur: a.nExt
        ? { pour: a.pourExt / a.nExt, contre: a.contreExt / a.nExt, n: a.nExt }
        : null,
    };
  }
  return stats;
}

/**
 * Le classement, reconstruit à partir des rencontres fournies.
 *
 * Barème de la LNR amputé du bonus offensif, qui demande le nombre d'essais :
 * 4 points la victoire, 2 le nul, 1 au vaincu battu de cinq points ou moins.
 * On garde aussi la différence de points, qui sert à départager.
 */
function classement(matchs) {
  const t = {};
  const init = () => ({ pts: 0, diff: 0, j: 0 });

  for (const m of matchs) {
    const d = (t[m.homeTeamId] ||= init());
    const e = (t[m.awayTeamId] ||= init());
    d.j++; e.j++;

    const ecart = m.homeScore - m.awayScore;
    d.diff += ecart;
    e.diff -= ecart;

    if (ecart > 0) {
      d.pts += 4;
      if (ecart <= 5) e.pts += 1;
    } else if (ecart < 0) {
      e.pts += 4;
      if (-ecart <= 5) d.pts += 1;
    } else {
      d.pts += 2; e.pts += 2;
    }
  }
  return t;
}

/**
 * Les notes Elo, et l'avantage du terrain qui va avec.
 *
 * Toutes les équipes partent de 1500 — on n'a pas d'historique d'avant-saison,
 * et en donner un faux serait pire que de n'en donner aucun. K = 20 : la note
 * bouge d'une vingtaine de points sur une surprise complète, ce qui demande
 * quatre ou cinq matchs pour qu'un club change de rang. Plus haut, la note
 * suivrait le dernier résultat ; plus bas, elle ne suivrait plus la saison.
 *
 * L'avantage du terrain est déduit du taux de victoires à domicile observé,
 * converti en points Elo : si le receveur gagne 60 % des matchs décisifs,
 * l'avantage vaut ce qu'il faut d'Elo pour donner 60 % de chances à deux clubs
 * de même niveau. Rien n'est écrit en dur, et il se recalcule avant chaque
 * journée comme le reste. Les bornes sur le taux n'existent que pour éviter
 * l'infini quand deux ou trois matchs seulement sont connus.
 */
const K_ELO = 20;

function notesElo(matchs) {
  let dom = 0, decisifs = 0;
  for (const m of matchs) {
    if (m.homeScore === m.awayScore) continue;
    decisifs++;
    if (m.homeScore > m.awayScore) dom++;
  }
  const taux = decisifs ? Math.min(0.95, Math.max(0.05, dom / decisifs)) : 0.5;
  const avantage = -400 * Math.log10(1 / taux - 1);

  const notes = {};
  const note = (id) => (notes[id] ??= 1500);

  for (const m of matchs) {
    const rh = note(m.homeTeamId);
    const ra = note(m.awayTeamId);
    const attendu = 1 / (1 + 10 ** ((ra - rh - avantage) / 400));
    const reel = m.homeScore > m.awayScore ? 1 : m.homeScore < m.awayScore ? 0 : 0.5;
    notes[m.homeTeamId] = rh + K_ELO * (reel - attendu);
    notes[m.awayTeamId] = ra - K_ELO * (reel - attendu);
  }

  return { notes, avantage };
}

/* -------------------------------------------------------------------------- */
/* Les stratégies                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Chacune reçoit le contexte d'un match — la rencontre, et tout ce qui était
 * connu avant la journée — et rend un couple de scores. Les ajouter ici suffit
 * à les faire entrer dans les deux tableaux.
 */

/** Le score que l'on donne aux stratégies qui ne pronostiquent qu'un vainqueur. */
const FAVORI = 27;
const OUTSIDER = 21;
const enFaveurDu = (receveurGagne) => (receveurGagne ? [FAVORI, OUTSIDER] : [OUTSIDER, FAVORI]);

const STRATEGIES = [
  {
    cle: 'bob',
    nom: 'Bob',
    prono: ({ sd, se }) => {
      const { home, away } = bob.estimation({ dom: sd, ext: se });
      return [home, away];
    },
  },
  {
    cle: 'variante',
    nom: 'variante',
    /**
     * Moyennes séparées domicile / extérieur, sans le bonus fixe de six points.
     *
     * Même structure que la formule d'origine — la moyenne entre ce que l'un
     * marque et ce que l'autre encaisse — mais sur les chiffres du bon
     * contexte. Un club qui n'a pas encore joué à domicile retombe sur sa
     * moyenne générale : refuser de pronostiquer serait pire qu'une
     * approximation.
     */
    prono: ({ sd, se }) => {
      const pour = (s, cle) => (s?.[cle]?.pour ?? s?.pointsPourParMatch ?? bob.SCORE_DEFAUT);
      const contre = (s, cle) => (s?.[cle]?.contre ?? s?.pointsContreParMatch ?? bob.SCORE_DEFAUT);

      const r = (v) => Math.max(0, Math.round(v));
      let h = r((pour(sd, 'domicile') + contre(se, 'exterieur')) / 2);
      const a = r((pour(se, 'exterieur') + contre(sd, 'domicile')) / 2);
      if (h === a) h += 1;   // pas de nul : même règle que Bob
      return [h, a];
    },
  },
  {
    cle: 'classement',
    nom: 'classement',
    /**
     * Le mieux classé gagne ; à égalité de points, la meilleure différence ; à
     * égalité complète, le receveur, qui a le terrain pour lui. Un club encore
     * absent du classement est traité comme le plus mal classé.
     */
    prono: ({ m, table }) => {
      const rang = (id) => table[id] || { pts: -1, diff: -9999 };
      const d = rang(m.homeTeamId);
      const e = rang(m.awayTeamId);
      if (d.pts !== e.pts) return enFaveurDu(d.pts > e.pts);
      if (d.diff !== e.diff) return enFaveurDu(d.diff > e.diff);
      return enFaveurDu(true);
    },
  },
  {
    cle: 'elo',
    nom: 'elo',
    /** La meilleure note gagne, avantage du terrain compris. */
    prono: ({ m, elo }) => {
      const n = (id) => elo.notes[id] ?? 1500;
      return enFaveurDu(n(m.homeTeamId) + elo.avantage >= n(m.awayTeamId));
    },
  },
  {
    cle: 'domicile',
    nom: 'domicile',
    /** Le receveur gagne, toujours, de six points. Le plancher à battre. */
    prono: () => [FAVORI, OUTSIDER],
  },
  {
    cle: 'moyenne',
    nom: 'moyenne',
    /** Le score moyen du championnat, au receveur. L'autre plancher. */
    prono: () => [24, 23],
  },
];

/* -------------------------------------------------------------------------- */

const compteur = () => ({ pts: 0, bons: 0, n: 0, par: [0, 0, 0, 0] });

function enregistrer(c, pred, m) {
  const p = points(pred[0], pred[1], m.homeScore, m.awayScore);
  c.pts += p;
  c.n++;
  c.par[p]++;
  if (vainqueur(pred[0], pred[1]) === vainqueur(m.homeScore, m.awayScore)) c.bons++;
}

async function main() {
  require('dotenv').config();

  const url = process.env.DATABASE_URL || '';
  let hote = 'inconnue';
  try { hote = new URL(url).hostname; } catch { /* laissée à inconnue */ }
  console.log(`Base interrogée : ${hote}\n`);

  const matchs = await prisma.match.findMany({
    where: { status: 'FINISHED', homeScore: { not: null }, awayScore: { not: null } },
    orderBy: [{ round: 'asc' }, { kickoff: 'asc' }],
  });

  if (!matchs.length) {
    console.log('Aucune rencontre terminée en base.');
    return;
  }

  const journees = [...new Set(matchs.map((m) => m.round))].sort((a, b) => a - b);

  // Les points des joueurs, pour la comparaison. On lit `basePoints`, qui va de
  // 0 à 3 et dit la justesse du pronostic ; `points` inclut les multiplicateurs
  // et ne se compare donc pas à un algorithme qui ne parie pas. Un pronostic à
  // au moins un point est, par construction du barème, un bon vainqueur : les
  // humains entrent donc dans la colonne de gauche sans traitement particulier.
  const pronos = await prisma.prediction.findMany({
    where: { matchId: { in: matchs.map((m) => m.id) } },
    select: { matchId: true, basePoints: true, points: true },
  });
  const humainsParMatch = {};
  for (const p of pronos) {
    const n = p.basePoints ?? p.points;
    if (n === null || n === undefined) continue;
    (humainsParMatch[p.matchId] ||= []).push(n);
  }

  const totaux = {};
  for (const s of STRATEGIES) totaux[s.cle] = compteur();
  const humains = compteur();
  let humainsPoints = 0, humainsMatchs = 0;   // moyenne par match, pour le second tableau

  const lignes = [];
  let receveurVainqueur = 0, nuls = 0;

  for (const journee of journees) {
    // La règle qui rend la mesure honnête : rien de ce qui s'est joué à partir
    // de cette journée-là n'entre dans ce qui sert à la pronostiquer.
    const avant = matchs.filter((m) => m.round < journee);
    if (!avant.length) continue;              // la J1 n'a rien derrière elle

    const stats = moyennes(avant);
    const table = classement(avant);
    const elo = notesElo(avant);
    const duJour = matchs.filter((m) => m.round === journee);

    const ligne = { journee, n: duJour.length, pts: {}, bons: {}, humains: 0, nHumains: 0 };
    for (const s of STRATEGIES) { ligne.pts[s.cle] = 0; ligne.bons[s.cle] = 0; }

    for (const m of duJour) {
      const ctx = { m, sd: stats[m.homeTeamId] || null, se: stats[m.awayTeamId] || null, table, elo, stats };

      if (m.homeScore === m.awayScore) nuls++;
      else if (m.homeScore > m.awayScore) receveurVainqueur++;

      for (const s of STRATEGIES) {
        const pred = s.prono(ctx);
        const avantPts = totaux[s.cle].pts;
        const avantBons = totaux[s.cle].bons;
        enregistrer(totaux[s.cle], pred, m);
        ligne.pts[s.cle] += totaux[s.cle].pts - avantPts;
        ligne.bons[s.cle] += totaux[s.cle].bons - avantBons;
      }

      const h = humainsParMatch[m.id] || [];
      if (h.length) {
        for (const n of h) {
          humains.pts += n;
          humains.n++;
          humains.par[n] = (humains.par[n] || 0) + 1;
          if (n >= 1) humains.bons++;
        }
        ligne.humains += h.reduce((s, x) => s + x, 0) / h.length;
        ligne.nHumains++;
      }
    }

    humainsPoints += ligne.humains;
    humainsMatchs += ligne.nHumains;
    lignes.push(ligne);
  }

  if (!lignes.length) {
    console.log('Une seule journée jouée : il n\'y a encore rien à mesurer.');
    return;
  }

  const nMatchs = lignes.reduce((s, l) => s + l.n, 0);
  const pct = (x, n) => (n ? `${((100 * x) / n).toFixed(0)}%` : '—');

  /* ---------------------------------------------------------------------- */
  /* Tableau 1 : le taux de bons vainqueurs, qui est la vraie mesure        */
  /* ---------------------------------------------------------------------- */

  console.log(`${nMatchs} matchs mesurés, sur les journées ${lignes[0].journee} à ${lignes[lignes.length - 1].journee}.`);
  console.log('Tout ce qui sert à pronostiquer une journée est recalculé sur les seules journées précédentes.\n');

  console.log(
    'Stratégie'.padEnd(13) + 'bons vainqueurs'.padStart(17) + 'taux'.padStart(7) +
    'points'.padStart(9) + 'pts/match'.padStart(11) + '   3 / 2 / 1 / 0'
  );
  console.log('-'.repeat(13 + 17 + 7 + 9 + 11 + 17));

  const ligneStrategie = (nom, c, pts = c.pts, nPts = c.n) => {
    console.log(
      nom.padEnd(13) +
      `${c.bons} / ${c.n}`.padStart(17) +
      pct(c.bons, c.n).padStart(7) +
      (Number.isInteger(pts) ? String(pts) : pts.toFixed(1)).padStart(9) +
      (nPts ? (pts / nPts).toFixed(2) : '—').padStart(11) +
      '   ' + `${c.par[3] || 0} / ${c.par[2] || 0} / ${c.par[1] || 0} / ${c.par[0] || 0}`
    );
  };

  for (const s of STRATEGIES) ligneStrategie(s.nom, totaux[s.cle]);
  console.log('-'.repeat(13 + 17 + 7 + 9 + 11 + 17));
  // La ligne des joueurs compte des pronostics là où les autres comptent des
  // matchs : huit copains sur un même match, ce sont huit tirages, et c'est bien
  // ce qu'il faut pour un taux. Les points, eux, restent la moyenne par match —
  // sinon la colonne ne se comparerait plus aux lignes du dessus.
  if (humains.n) ligneStrategie('joueurs', humains, humainsPoints, humainsMatchs);

  console.log(
    `\nRéférence : le receveur a gagné ${receveurVainqueur} des ${nMatchs} matchs ` +
    `(${pct(receveurVainqueur, nMatchs)})${nuls ? `, ${nuls} nul(s)` : ''}.`
  );

  /**
   * L'incertitude, qui vaut autant que les chiffres.
   *
   * Un taux voisin de la moitié, mesuré sur n tirages, est connu à un
   * écart-type de 0.5/racine(n) près — et il faut le double pour la fourchette
   * à 95 %. Sur 35 matchs cela fait huit points de pourcentage : deux stratégies
   * séparées de moins que cela sont à égalité, quel que soit l'ordre dans
   * lequel le tableau les affiche. C'est la même erreur que de choisir une
   * couleur sans la mesurer — une impression présentée comme un résultat.
   */
  const marge = (50 / Math.sqrt(nMatchs)).toFixed(0);
  console.log(
    `Incertitude : un écart-type vaut environ ${marge} points de pourcentage sur ` +
    `${nMatchs} matchs.\nDeux stratégies séparées de moins que cela sont à égalité, même si le\n` +
    'tableau en place une au-dessus de l\'autre.'
  );

  /* ---------------------------------------------------------------------- */
  /* Tableau 2 : les points journée par journée, pour voir la dispersion    */
  /* ---------------------------------------------------------------------- */

  const col = (x) => String(x).padStart(11);
  console.log('\n\nPoints marqués au barème du jeu, journée par journée.\n');
  console.log(
    'Journée'.padEnd(9) + 'matchs'.padStart(7) +
    STRATEGIES.map((s) => col(s.nom)).join('') + col('joueurs')
  );
  console.log('-'.repeat(9 + 7 + 11 * (STRATEGIES.length + 1)));

  for (const l of lignes) {
    console.log(
      `J${l.journee}`.padEnd(9) + String(l.n).padStart(7) +
      STRATEGIES.map((s) => col(l.pts[s.cle])).join('') +
      col(l.nHumains ? l.humains.toFixed(1) : '—')
    );
  }

  console.log('-'.repeat(9 + 7 + 11 * (STRATEGIES.length + 1)));
  console.log(
    'Total'.padEnd(9) + String(nMatchs).padStart(7) +
    STRATEGIES.map((s) => col(totaux[s.cle].pts)).join('') +
    col(humainsMatchs ? humainsPoints.toFixed(1) : '—')
  );

  console.log(
    `\nLecture : 3 points pour un score exact, 2 pour le bon vainqueur à moins de\n` +
    `5 points près des deux côtés, 1 pour le bon vainqueur, 0 sinon — le maximum\n` +
    `théorique est ${nMatchs * 3} points. « classement » et « elo » ne pronostiquent\n` +
    `qu'un vainqueur : on leur prête le score ${FAVORI}-${OUTSIDER}, leurs points ne sont donc\n` +
    `qu'une conséquence de leur taux. « domicile » parie ${FAVORI}-${OUTSIDER} à chaque match et\n` +
    `« moyenne » 24-23 : ce sont les planchers, les autres doivent les battre.`
  );

  if (lignes.length < 8) {
    console.log(
      `\nÀ relancer quand la saison aura avancé : ${nMatchs} matchs suffisent à écarter\n` +
      'une stratégie franchement mauvaise, pas à départager celles qui se tiennent.'
    );
  }
}

main()
  .catch((err) => { console.error('\nEchec :', err.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
