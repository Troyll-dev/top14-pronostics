/**
 * L'analyseur du Tournoi, mis a l'epreuve sur les vraies pages.
 *
 * On lit deux editions qui ne se ressemblent pas : 2027, a venir, ou chaque
 * carte porte un coup d'envoi et aucun score ; et 2026, jouee, ou c'est
 * l'inverse. Un analyseur qui ne saurait lire que l'une des deux serait inutile
 * — le calendrier sert a pronostiquer, les scores a departager.
 *
 * Ce qu'il faut verifier a l'oeil, et que le script ne peut pas verifier seul :
 * que les resultats de 2026 sont les bons. Tu connais ces matchs ; c'est la
 * seule verification qui vaille, et elle prend trente secondes.
 *
 *   node scripts/six-nations-essai.js
 *   node scripts/six-nations-essai.js 2025 2024
 *
 * Lecture seule.
 */

const sn = require('../src/services/sources/six-nations');

const ANNEES = (() => {
  const a = process.argv.slice(2).filter((x) => /^\d{4}$/.test(x)).map(Number);
  return a.length ? a : [2027, 2026];
})();

(async () => {
  for (const annee of ANNEES) {
    console.log('\n' + '='.repeat(72));
    console.log(`TOURNOI ${annee}`);
    console.log('='.repeat(72));

    let r;
    try {
      r = await sn.fetchSeason(annee);
    } catch (err) {
      console.log(`\n  ECHEC : ${err.message}\n`);
      continue;
    }

    console.log(`\n  ${r.url}`);
    console.log(`  ${r.matchs.length} rencontres\n`);

    console.log('  jour         heure   affiche              score    stade');
    console.log('  ' + '-'.repeat(68));

    for (const m of r.matchs) {
      // L'heure est affichee en heure de Paris : c'est celle a laquelle les
      // joueurs regarderont le match, et celle qui decidera de la cloture des
      // pronostics.
      const heure = m.kickoff
        ? m.kickoff.toLocaleTimeString('fr-FR', {
            timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit',
          })
        : '  –  ';
      const score = m.joue ? `${m.homeScore}-${m.awayScore}`.padStart(7) : '      –';
      console.log(
        `  ${String(m.jour || '?').padEnd(12)} ${heure.padEnd(7)} ` +
        `${`${m.home} – ${m.away}`.padEnd(20)} ${score}  ${String(m.stade || '').slice(0, 26)}`
      );
    }

    /*
     * Les comptes qui doivent tomber juste.
     *
     * Chaque nation joue cinq rencontres, et en recoit deux ou trois. Un
     * decompte different ne signale pas forcement une erreur de lecture — mais
     * il signale toujours quelque chose, et c'est moins cher a verifier
     * maintenant qu'en fevrier.
     */
    const parNation = {};
    for (const m of r.matchs) {
      for (const [code, recoit] of [[m.home, true], [m.away, false]]) {
        parNation[code] = parNation[code] || { joues: 0, recus: 0 };
        parNation[code].joues++;
        if (recoit) parNation[code].recus++;
      }
    }

    console.log('\n  rencontres par nation (5 attendues, dont 2 ou 3 a domicile) :');
    for (const [code, c] of Object.entries(parNation).sort()) {
      const ok = c.joues === 5 && (c.recus === 2 || c.recus === 3);
      console.log(`    ${code}  ${c.joues} dont ${c.recus} a domicile  ${ok ? '' : '  <-- inattendu'}`);
    }

    const joues = r.matchs.filter((m) => m.joue).length;
    const verifies = r.matchs.filter((m) => m.ordreVerifie).length;
    console.log(`\n  ${joues} rencontre(s) avec score, ${r.matchs.length - joues} a venir`);
    console.log(`  ordre domicile/exterieur verifie par le stade sur ${verifies}/${r.matchs.length}`);

    if (r.anomalies.length) {
      console.log('\n  ANOMALIES :');
      for (const a of r.anomalies) console.log(`    ${a}`);
    } else {
      console.log('  aucune anomalie');
    }

    await new Promise((x) => setTimeout(x, 800));
  }

  console.log(`

${'='.repeat(72)}
  Pour 2026, verifie quelques scores de memoire : c'est la seule chose qu'un
  script ne peut pas faire a ta place, et c'est exactement ce qui avait
  manque aux compositions du Top 14 pendant six journees.
${'='.repeat(72)}
`);
})().catch((e) => {
  console.error('\nEchec :', e.message);
  process.exit(1);
});
