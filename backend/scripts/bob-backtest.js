/**
 * Que vaut Bob ? — rejoue l'algorithme sur les journées déjà jouées.
 *
 *   node scripts/bob-backtest.js
 *
 * À lancer depuis `backend/`. Ne modifie rien, n'écrit nulle part, n'envoie
 * aucun courriel : il lit la base et imprime un tableau.
 *
 * ---------------------------------------------------------------------------
 * POURQUOI CE SCRIPT EXISTE
 * ---------------------------------------------------------------------------
 *
 * On veut rendre Bob plus malin. Avant de toucher à sa formule, il faut savoir
 * ce qu'elle vaut — sans quoi « plus malin » restera une impression, et on a vu
 * ce que valent les impressions non mesurées.
 *
 * Le script répond à trois questions :
 *
 *   combien Bob aurait-il marqué, au barème du jeu, sur les journées jouées ?
 *   fait-il mieux que deux stratégies bêtes, qui servent de plancher ?
 *   fait-il mieux ou moins bien que les joueurs humains ?
 *
 * La troisième est la plus intéressante. Un algorithme qui bat la moyenne des
 * copains est un outil ; un algorithme qui perd contre eux est une béquille
 * pour les soirs de retard, ce que Bob est aujourd'hui — et il n'y a aucune
 * honte à ça, encore faut-il le savoir.
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
 * Les moyennes sont donc recalculées avant chaque journée, à partir des seules
 * rencontres antérieures. La journée 1 est exclue du total : personne, humain
 * ou machine, n'a de statistiques à ce moment-là.
 *
 * ---------------------------------------------------------------------------
 * LA VARIANTE
 * ---------------------------------------------------------------------------
 *
 * Le script mesure aussi une version modifiée de Bob, pour chiffrer la première
 * piste d'amélioration : séparer les moyennes à domicile et à l'extérieur.
 *
 * Bob traite aujourd'hui les quatorze clubs comme s'ils jouaient pareil partout,
 * puis rattrape l'écart par un bonus fixe de six points au receveur. C'est une
 * approximation grossière : certains clubs sont imprenables chez eux et
 * transparents au-dehors, d'autres non, et cette différence-là est précisément
 * ce qu'un pronostiqueur regarde en premier. La variante mesure la vraie
 * moyenne de chaque club à domicile et à l'extérieur, et se passe du bonus
 * fixe.
 *
 * Si elle gagne nettement, la piste est bonne. Si elle ne gagne rien, on aura
 * économisé une refonte — et c'est une réponse tout aussi utile.
 */

const { PrismaClient } = require('@prisma/client');
const bob = require('../src/services/bob.service');

const prisma = new PrismaClient();

/**
 * Le barème du jeu, tel qu'il est appliqué au calcul des points.
 *
 * Trois pour le score exact, deux pour le bon vainqueur à cinq points près des
 * deux côtés, un pour le bon vainqueur, zéro sinon. On ne compte ni le joker ni
 * l'affiche : ce sont des multiplicateurs de pari, pas de justesse, et les
 * inclure comparerait des stratégies au lieu de comparer des pronostics.
 */
const ECART_PROCHE = 5;

function points(predH, predA, reelH, reelA) {
  if (predH === reelH && predA === reelA) return 3;

  const vainqueur = (h, a) => (h > a ? 'dom' : a > h ? 'ext' : 'nul');
  if (vainqueur(predH, predA) !== vainqueur(reelH, reelA)) return 0;

  const proche =
    Math.abs(predH - reelH) <= ECART_PROCHE && Math.abs(predA - reelA) <= ECART_PROCHE;
  return proche ? 2 : 1;
}

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

/** Bob tel qu'il est aujourd'hui, sans l'aléa. */
function pronoBob(statsDom, statsExt) {
  const { home, away } = bob.estimation({ dom: statsDom, ext: statsExt });
  return [home, away];
}

/**
 * La variante : moyennes séparées domicile / extérieur, sans bonus fixe.
 *
 * Même structure que la formule d'origine — la moyenne entre ce que l'un marque
 * et ce que l'autre encaisse — mais sur les chiffres du bon contexte. Un club
 * qui n'a pas encore joué à domicile retombe sur sa moyenne générale : c'est le
 * cas des deux premières journées, et refuser de pronostiquer serait pire
 * qu'une approximation.
 */
function pronoVariante(sd, se) {
  const pour = (s, cle) => (s?.[cle]?.pour ?? s?.pointsPourParMatch ?? bob.SCORE_DEFAUT);
  const contre = (s, cle) => (s?.[cle]?.contre ?? s?.pointsContreParMatch ?? bob.SCORE_DEFAUT);

  const home = (pour(sd, 'domicile') + contre(se, 'exterieur')) / 2;
  const away = (pour(se, 'exterieur') + contre(sd, 'domicile')) / 2;

  const r = (v) => Math.max(0, Math.round(v));
  let h = r(home), a = r(away);
  if (h === a) h += 1;   // pas de nul : même règle que Bob
  return [h, a];
}

/** Deux planchers, pour savoir si Bob fait mieux que rien. */
const pronoDomicile = () => [27, 21];           // le receveur gagne, toujours, de 6
const pronoMoyenne = () => [24, 24 - 1];        // le score moyen du championnat

async function main() {
  require('dotenv').config();

  const url = process.env.DATABASE_URL || '';
  let hote = 'inconnue';
  try { hote = new URL(url).hostname; } catch { /* laissée à inconnue */ }
  console.log(`Base interrogée : ${hote}\n`);

  const matchs = await prisma.match.findMany({
    where: { status: 'FINISHED', homeScore: { not: null }, awayScore: { not: null } },
    include: { homeTeam: true, awayTeam: true },
    orderBy: [{ round: 'asc' }, { kickoff: 'asc' }],
  });

  if (!matchs.length) {
    console.log('Aucune rencontre terminée en base.');
    return;
  }

  const journees = [...new Set(matchs.map((m) => m.round))].sort((a, b) => a - b);

  // Les points des joueurs, pour la comparaison. On lit `basePoints`, qui va de
  // 0 à 3 et dit la justesse du pronostic ; `points` inclut les multiplicateurs
  // et ne se compare donc pas à un algorithme qui ne parie pas.
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

  const total = { bob: 0, variante: 0, domicile: 0, moyenne: 0, humains: 0, n: 0, nHumains: 0 };
  const lignes = [];

  for (const journee of journees) {
    // La règle qui rend la mesure honnête : rien de ce qui s'est joué à partir
    // de cette journée-là n'entre dans les moyennes.
    const avant = matchs.filter((m) => m.round < journee);
    if (!avant.length) continue;              // la J1 n'a rien derrière elle

    const stats = moyennes(avant);
    const duJour = matchs.filter((m) => m.round === journee);

    const l = { journee, n: duJour.length, bob: 0, variante: 0, domicile: 0, moyenne: 0, humains: 0, nHumains: 0 };

    for (const m of duJour) {
      const sd = stats[m.homeTeamId] || null;
      const se = stats[m.awayTeamId] || null;

      const [bh, ba] = pronoBob(sd, se);
      const [vh, va] = pronoVariante(sd, se);
      const [dh, da] = pronoDomicile();
      const [mh, ma] = pronoMoyenne();

      l.bob += points(bh, ba, m.homeScore, m.awayScore);
      l.variante += points(vh, va, m.homeScore, m.awayScore);
      l.domicile += points(dh, da, m.homeScore, m.awayScore);
      l.moyenne += points(mh, ma, m.homeScore, m.awayScore);

      const h = humainsParMatch[m.id] || [];
      if (h.length) {
        l.humains += h.reduce((s, x) => s + x, 0) / h.length;
        l.nHumains++;
      }
    }

    lignes.push(l);
    total.bob += l.bob; total.variante += l.variante;
    total.domicile += l.domicile; total.moyenne += l.moyenne;
    total.humains += l.humains; total.n += l.n; total.nHumains += l.nHumains;
  }

  if (!lignes.length) {
    console.log('Une seule journée jouée : il n\'y a encore rien à mesurer.');
    return;
  }

  // Dix et non huit : « variante » fait huit caracteres, les en-tetes se
  // touchaient donc sans espace entre eux.
  const col = (x) => String(x).padStart(10);
  console.log('Points marqués au barème du jeu, journée par journée.');
  console.log('Les moyennes des clubs ne tiennent compte que des journées précédentes.\n');
  console.log(
    'Journée'.padEnd(9) + 'matchs'.padStart(7) +
    col('Bob') + col('variante') + col('domicile') + col('moyenne') + col('joueurs')
  );
  console.log('-'.repeat(9 + 7 + 10 * 5));

  for (const l of lignes) {
    console.log(
      `J${l.journee}`.padEnd(9) + String(l.n).padStart(7) +
      col(l.bob) + col(l.variante) + col(l.domicile) + col(l.moyenne) +
      col(l.nHumains ? l.humains.toFixed(1) : '—')
    );
  }

  console.log('-'.repeat(9 + 7 + 10 * 5));
  console.log(
    'Total'.padEnd(9) + String(total.n).padStart(7) +
    col(total.bob) + col(total.variante) + col(total.domicile) + col(total.moyenne) +
    col(total.nHumains ? total.humains.toFixed(1) : '—')
  );

  const parMatch = (x, n = total.n) => (n ? (x / n).toFixed(2) : '—');
  console.log(
    '\nPar match : ' +
    `Bob ${parMatch(total.bob)} · ` +
    `variante ${parMatch(total.variante)} · ` +
    `domicile ${parMatch(total.domicile)} · ` +
    `moyenne ${parMatch(total.moyenne)} · ` +
    `joueurs ${parMatch(total.humains, total.nHumains)}`
  );

  /**
   * L'avertissement sur la taille de l'echantillon.
   *
   * Il est au moins aussi important que les chiffres. Sur trois journees, soit
   * vingt et un matchs, un seul resultat qui bascule deplace le total d'un ou
   * deux points — c'est-a-dire l'ecart qui separe les quatre strategies. Lire
   * un classement dans ce bruit serait la meme erreur que de choisir une
   * couleur sans la mesurer : une impression presentee comme un resultat.
   */
  if (lignes.length < 5) {
    console.log(
      `\nATTENTION : seulement ${lignes.length} journee(s) mesuree(s), ${total.n} matchs.\n` +
      'C\'est trop peu pour departager ces strategies — un seul resultat qui\n' +
      'bascule deplace le total autant que l\'ecart entre elles. A relancer\n' +
      'quand la saison aura avance, et sur la base de production.'
    );
  }

  console.log(
    '\nLecture : 3 points pour un score exact, 2 pour le bon vainqueur a moins de\n' +
    '5 points pres des deux cotes, 1 pour le bon vainqueur, 0 sinon. Le maximum\n' +
    `theorique est ${total.n * 3} points. « domicile » parie 27-21 a chaque match,\n` +
    '« moyenne » parie 24-23 : ce sont les planchers, Bob doit les battre.'
  );
}

main()
  .catch((err) => { console.error('\nEchec :', err.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
