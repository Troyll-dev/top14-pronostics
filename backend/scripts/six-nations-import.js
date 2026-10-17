/**
 * Importer le Tournoi des Six Nations sans attendre la tâche automatique.
 *
 * Par défaut, il ne touche à rien et dit ce qu'il ferait : les nations à créer,
 * les quinze rencontres avec leur journée, leur coup d'envoi et leur stade.
 * L'écriture se demande explicitement.
 *
 *   node scripts/six-nations-import.js             simulation
 *   node scripts/six-nations-import.js --ecrire    pour de vrai
 *
 * Relancer l'écriture ne fait rien de plus : les nations et les rencontres déjà
 * en base sont reconnues, seul un horaire ou un stade changé serait mis à jour.
 */

const { syncSixNations } = require('../src/services/six-nations-sync.service');

const ECRIRE = process.argv.includes('--ecrire');

(async () => {
  console.log(`\nTournoi des Six Nations — ${ECRIRE ? 'ÉCRITURE' : 'simulation (rien ne sera écrit)'}\n`);

  const r = await syncSixNations({ dryRun: !ECRIRE });

  const bloc = (titre, liste) => {
    if (!liste.length) return;
    console.log(`\n  ${titre} (${liste.length})`);
    for (const l of liste) console.log(`    ${l}`);
  };

  bloc('nations à créer', r.nations);
  bloc('rencontres à créer', r.crees);
  bloc('rencontres à mettre à jour', r.modifies);
  bloc('scores définitifs', r.scores);
  bloc('REFUS', r.refuses);
  console.log(`\n  inchangées : ${r.inchanges}`);

  if (!ECRIRE) {
    console.log(`
  Simulation. Si la liste est juste — quinze rencontres, cinq journées de
  trois, les bons stades — relancer avec :

      node scripts/six-nations-import.js --ecrire
`);
  }
  process.exit(0);
})().catch((e) => {
  console.error('\nÉchec :', e.message);
  process.exit(1);
});
