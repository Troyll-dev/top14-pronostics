/**
 * Lit les compositions des rencontres a venir, a la main.
 *
 *   node scripts/sync-compositions.js                 simulation, rien n'est ecrit
 *   node scripts/sync-compositions.js --force         ecrit en base
 *   node scripts/sync-compositions.js --round 5       une journee precise
 *   node scripts/sync-compositions.js --round 5 --force
 *
 * La simulation est le mode par defaut, et elle affiche les quinze noms : c'est
 * ce qui permet de verifier a l'oeil qu'on n'a pas interverti les deux camps
 * avant d'ecrire quoi que ce soit.
 */

const { syncCompositions } = require('../src/services/composition-sync.service');

const args = process.argv.slice(2);
const force = args.includes('--force');
const iRound = args.indexOf('--round');
const rounds = iRound >= 0 && args[iRound + 1] ? [Number(args[iRound + 1])] : null;

(async () => {
  const r = await syncCompositions({ dryRun: !force, rounds });

  console.log('');
  console.log(force ? '=== ECRITURE ===' : '=== SIMULATION (aucune ecriture) ===');
  console.log('Journees :', r.rounds.join(', ') || '(aucune)');
  for (const [k, v] of Object.entries(r.sources)) console.log(`  ${k} : ${v}`);
  if (r.reason) console.log(r.reason);

  for (const a of r.apercus) {
    console.log('');
    console.log(`--- ${a.match}${a.arbitre ? `   arbitre : ${a.arbitre}` : ''}`);
    const n = Math.max(a.home.length, a.away.length);
    for (let i = 0; i < n; i++) {
      console.log(`  ${(a.home[i] || '').padEnd(34)}${a.away[i] || ''}`);
    }
  }

  console.log('');
  for (const c of r.changes) console.log(`  ${c}`);
  for (const u of r.unmatched) console.log(`  ! ${u}`);
  console.log('');
  console.log(
    `${r.updated} composition(s) ${force ? 'ecrite(s)' : 'a ecrire'}, ` +
    `${r.skipped} inchangee(s), ${r.enAttente} pas encore publiee(s)`
  );
  if (!r.ok) console.log('Des erreurs ont ete rencontrees : relire les lignes ci-dessus.');

  process.exit(r.ok ? 0 : 1);
})().catch((err) => {
  console.error('ECHEC :', err.message);
  process.exit(1);
});
