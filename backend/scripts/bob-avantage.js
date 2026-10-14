/**
 * Combien vaut l'avantage du terrain ? — balayage de la constante de Bob.
 *
 *   node scripts/bob-avantage.js
 *
 * A lancer depuis `backend/`. Ne modifie rien, n'ecrit nulle part, n'envoie
 * aucun courriel : il lit la base et imprime un tableau.
 *
 * ---------------------------------------------------------------------------
 * D'OU VIENT CETTE QUESTION
 * ---------------------------------------------------------------------------
 *
 * De trois mesures qui disent la meme chose par trois chemins differents.
 *
 * Le backtest : le receveur gagne 71 % des matchs de la saison, « parier le
 * receveur a chaque match » obtient donc 71 % de bons vainqueurs, et personne ne
 * fait mieux — ni les copains, ni l'Elo, ni le classement. Bob, lui, est a 66 %.
 *
 * Le calibrage : Bob se trompe de -3,3 points sur les receveurs et de +6,4 sur
 * les visiteurs. Un ecart signe, constant, dans le meme sens des deux cotes.
 * Additionnes, ces deux chiffres disent que l'ecart domicile-exterieur reel
 * depasse d'une dizaine de points celui que Bob annonce.
 *
 * Et sa formule : un bonus fixe de six points au receveur, pose a la main au
 * depart, jamais mesure depuis. S'il vaut dix, Bob donne la moitie de ce qu'il
 * faut, et il designe donc le visiteur un peu trop souvent — ce qui explique
 * exactement les cinq points qui le separent du plafond.
 *
 * Ce script remplace la constante par une serie de valeurs et regarde ce que
 * chacune donne. C'est le seul reglage de Bob qui touche au choix du vainqueur,
 * donc le seul qui puisse le rapprocher du plafond — et le seul, aussi, qui
 * puisse l'en eloigner. D'ou la mesure avant de toucher a quoi que ce soit.
 *
 * ---------------------------------------------------------------------------
 * CE QUE CE SCRIPT NE PROUVE PAS
 * ---------------------------------------------------------------------------
 *
 * Choisir la valeur qui marque le plus de points sur ces 35 matchs serait un
 * aller simple vers l'illusion : avec huit candidats et trente-cinq matchs, la
 * meilleure valeur sera toujours un peu meilleure que les autres, meme si elle
 * ne vaut rien.
 *
 * Ce qu'il faut lire, c'est la FORME de la colonne. Une amelioration reelle est
 * large et reguliere : 8, 10 et 12 doivent se tenir, et le sommet doit se
 * trouver quelque part au milieu plutot qu'a une extremite. Un pic isole sur une
 * seule valeur est du bruit.
 *
 * Et le chiffre qui compte vraiment vient d'ailleurs : le calibrage a mesure
 * l'ecart a corriger sans rien chercher a optimiser. Si le sommet de ce tableau
 * tombe la ou le biais le predisait, les deux mesures se confirment l'une
 * l'autre — et c'est cette coincidence, pas le total de points, qui autorise a
 * changer la constante.
 */

const { PrismaClient } = require('@prisma/client');
const bob = require('../src/services/bob.service');

const prisma = new PrismaClient();

/** Les valeurs essayees, en points d'avantage au receveur. */
const CANDIDATS = [0, 2, 4, 6, 8, 10, 12, 14];

const ECART_PROCHE = 5;
const SCORE_MAX = 200;
const vainqueur = (h, a) => (h > a ? 'dom' : a > h ? 'ext' : 'nul');

function points(predH, predA, reelH, reelA) {
  if (predH === reelH && predA === reelA) return 3;
  if (vainqueur(predH, predA) !== vainqueur(reelH, reelA)) return 0;
  const proche =
    Math.abs(predH - reelH) <= ECART_PROCHE && Math.abs(predA - reelA) <= ECART_PROCHE;
  return proche ? 2 : 1;
}

function moyennes(matchs) {
  const acc = {};
  const init = () => ({ n: 0, pour: 0, contre: 0 });
  for (const m of matchs) {
    const d = (acc[m.homeTeamId] ||= init());
    const e = (acc[m.awayTeamId] ||= init());
    d.n++; d.pour += m.homeScore; d.contre += m.awayScore;
    e.n++; e.pour += m.awayScore; e.contre += m.homeScore;
  }
  const stats = {};
  for (const [id, a] of Object.entries(acc)) {
    stats[id] = {
      joues: a.n,
      pointsPourParMatch: a.n ? a.pour / a.n : null,
      pointsContreParMatch: a.n ? a.contre / a.n : null,
    };
  }
  return stats;
}

/**
 * Le pronostic de Bob avec un avantage choisi.
 *
 * La formule est celle de `bob.service.js`, et `estimer` en vient directement :
 * la recopier ici, c'est prendre le risque qu'elle derive un jour sans que la
 * mesure s'en apercoive. Seule la constante d'avantage est remplacee, ce qui est
 * tout l'objet du script.
 *
 * La regle « pas de match nul » est appliquee, contrairement a `estimation` qui
 * s'en passe. C'est une correction de mes mesures precedentes : le vrai bot
 * n'ecrit jamais un nul en base — c'est `pronostiquerMatch` qui departage — donc
 * mesurer un Bob capable d'en pronostiquer un revenait a lui attribuer des
 * erreurs qu'il ne commet pas.
 */
function prono(sd, se, avantage) {
  const brutDom = bob.estimer(sd?.pointsPourParMatch, se?.pointsContreParMatch);
  const brutExt = bob.estimer(se?.pointsPourParMatch, sd?.pointsContreParMatch);

  const baseDom = (brutDom === null ? bob.SCORE_DEFAUT : brutDom) + avantage / 2;
  const baseExt = (brutExt === null ? bob.SCORE_DEFAUT : brutExt) - avantage / 2;

  const borner = (v) => Math.max(0, Math.min(SCORE_MAX, Math.round(v)));
  let h = borner(baseDom);
  let a = borner(baseExt);

  if (h === a) {
    if (baseDom >= baseExt) h = borner(h + 1);
    else a = borner(a + 1);
  }
  return [h, a];
}

async function main() {
  require('dotenv').config();

  const url = process.env.DATABASE_URL || '';
  let hote = 'inconnue';
  try { hote = new URL(url).hostname; } catch { /* laissee a inconnue */ }
  console.log(`Base interrogee : ${hote}`);
  console.log(`Avantage actuel dans bob.service.js : ${bob.AVANTAGE_DOMICILE} points\n`);

  const matchs = await prisma.match.findMany({
    where: { status: 'FINISHED', homeScore: { not: null }, awayScore: { not: null } },
    orderBy: [{ round: 'asc' }, { kickoff: 'asc' }],
  });

  if (!matchs.length) {
    console.log('Aucune rencontre terminee en base.');
    return;
  }

  const journees = [...new Set(matchs.map((m) => m.round))].sort((a, b) => a - b);

  const resultats = CANDIDATS.map((avantage) => ({
    avantage, points: 0, bons: 0, bande: 0, n: 0, erreur: 0, domiciles: 0,
  }));

  let receveurVainqueur = 0;

  for (const journee of journees) {
    const avant = matchs.filter((m) => m.round < journee);
    if (!avant.length) continue;              // la J1 n'a rien derriere elle

    const stats = moyennes(avant);

    for (const m of matchs.filter((x) => x.round === journee)) {
      if (m.homeScore > m.awayScore) receveurVainqueur++;

      for (const r of resultats) {
        const [h, a] = prono(stats[m.homeTeamId] || null, stats[m.awayTeamId] || null, r.avantage);
        const p = points(h, a, m.homeScore, m.awayScore);

        r.n++;
        r.points += p;
        if (p >= 2) r.bande++;
        if (vainqueur(h, a) === vainqueur(m.homeScore, m.awayScore)) r.bons++;
        if (vainqueur(h, a) === 'dom') r.domiciles++;
        r.erreur += (Math.abs(h - m.homeScore) + Math.abs(a - m.awayScore)) / 2;
      }
    }
  }

  const n = resultats[0].n;
  if (!n) {
    console.log('Une seule journee jouee : il n\'y a encore rien a mesurer.');
    return;
  }

  const pct = (x) => `${((100 * x) / n).toFixed(0)}%`;

  console.log(`${n} matchs mesures. Les moyennes des clubs ne tiennent compte que des journees anterieures.\n`);
  console.log(
    'Avantage'.padEnd(10) + 'bons vainqueurs'.padStart(17) + 'taux'.padStart(7) +
    'points'.padStart(9) + 'bande 2 pts'.padStart(13) + 'erreur/equipe'.padStart(15) +
    'parie dom.'.padStart(12)
  );
  console.log('-'.repeat(10 + 17 + 7 + 9 + 13 + 15 + 12));

  for (const r of resultats) {
    const marque = r.avantage === bob.AVANTAGE_DOMICILE ? ' <- actuel' : '';
    console.log(
      `${r.avantage} pts`.padEnd(10) +
      `${r.bons} / ${n}`.padStart(17) +
      pct(r.bons).padStart(7) +
      String(r.points).padStart(9) +
      String(r.bande).padStart(13) +
      (r.erreur / n).toFixed(1).padStart(15) +
      pct(r.domiciles).padStart(12) +
      marque
    );
  }

  console.log('-'.repeat(10 + 17 + 7 + 9 + 13 + 15 + 12));
  console.log(
    `Reference : le receveur a gagne ${receveurVainqueur} des ${n} matchs (${pct(receveurVainqueur)}),\n` +
    `ce qui est le plafond atteignable en pariant toujours le receveur.`
  );

  const marge = (50 / Math.sqrt(n)).toFixed(0);
  console.log(
    `Incertitude : un ecart-type vaut environ ${marge} points de pourcentage sur ${n} matchs.\n` +
    'Deux lignes separees de moins que cela sont a egalite.'
  );

  console.log(
    '\nLecture : c\'est la forme de la colonne « taux » qu\'il faut lire, pas son\n' +
    'maximum. Une amelioration reelle est large — trois valeurs voisines qui se\n' +
    'tiennent, avec le sommet au milieu. Un pic isole sur une seule valeur est du\n' +
    'bruit, et la colonne « parie dom. » dit pourquoi : plus l\'avantage monte, plus\n' +
    'Bob parie le receveur, jusqu\'a le parier toujours — a ce moment-la il n\'est\n' +
    'plus Bob, c\'est le plancher du backtest qui porte son nom.'
  );
}

main()
  .catch((err) => { console.error('\nEchec :', err.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
