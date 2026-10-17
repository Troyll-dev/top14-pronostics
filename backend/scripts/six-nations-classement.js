/**
 * Le classement du Tournoi, recalculé à partir des feuilles de match.
 *
 *   node scripts/six-nations-classement.js --annee 2026    vérifier sur 2026
 *   node scripts/six-nations-classement.js                  simulation, 2027
 *   node scripts/six-nations-classement.js --ecrire         enregistrer, 2027
 *
 * L'édition 2026 est complète : c'est elle qui permet de comparer le calcul au
 * tableau officiel, ligne à ligne, avant de lui faire confiance. Elle ne
 * s'enregistre pas — seule l'édition en cours a sa place en base.
 *
 * En temps normal, rien à lancer : la synchronisation du Tournoi recalcule le
 * classement d'elle-même après chaque nouveau score.
 */

const { majClassement } = require('../src/services/six-nations-classement.service');
const { ANNEE } = require('../src/services/six-nations-sync.service');

const i = process.argv.indexOf('--annee');
const annee = i > 0 ? Number(process.argv[i + 1]) : ANNEE;
const ECRIRE = process.argv.includes('--ecrire') && annee === ANNEE;

(async () => {
  console.log(`\nClassement du Tournoi ${annee} — ${ECRIRE ? 'ÉCRITURE' : 'simulation (rien ne sera écrit)'}\n`);

  const r = await majClassement({ annee, dryRun: !ECRIRE });

  console.log(`  ${r.matchs} rencontre(s) terminée(s), essais relus sur chaque feuille de match\n`);
  for (const m of r.rencontres) {
    const d = m.decompte;
    console.log(
      `    ${m.home}–${m.away}  ${String(m.homeScore).padStart(2)}–${String(m.awayScore).padEnd(2)}` +
      `   essais ${d.home.essais}–${d.away.essais}` +
      // Une transformation que la feuille de match a oubliée : sans effet sur le
      // classement, mais on le dit plutôt que de le taire.
      ((d.home.transformationsManquantes || d.away.transformationsManquantes)
        ? `   (transformation absente de la feuille : ${d.home.transformationsManquantes || 0}–${d.away.transformationsManquantes || 0})`
        : '')
    );
  }

  const pad = (v, n) => String(v).padStart(n);
  console.log('\n   #  Nation           Pts   J  G  N  P   PM   PE  Diff  EM  EE  Bonus');
  for (const l of r.table) {
    console.log(
      `  ${pad(l.rank, 2)}  ${l.name.padEnd(15)} ${pad(l.points, 4)}  ${pad(l.played, 2)} ${pad(l.won, 2)} ${pad(l.drawn, 2)} ${pad(l.lost, 2)}` +
      `  ${pad(l.pointsFor, 3)}  ${pad(l.pointsAgainst, 3)}  ${pad((l.diff > 0 ? '+' : '') + l.diff, 4)}  ${pad(l.triesFor, 2)}  ${pad(l.triesAgainst, 2)}  ${pad(l.bonus, 3)}` +
      (l.grandChelem ? '   + Grand Chelem (3)' : '')
    );
  }
  console.log('');
  process.exit(0);
})().catch((e) => {
  console.error('\nÉchec :', e.message);
  process.exit(1);
});
