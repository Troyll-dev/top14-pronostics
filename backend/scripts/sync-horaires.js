#!/usr/bin/env node
/**
 * Relit les horaires et diffuseurs a la demande.
 *
 *   node scripts/sync-horaires.js                 simulation, rien n'est ecrit
 *   node scripts/sync-horaires.js --force         ecrit
 *   node scripts/sync-horaires.js --force --j 4   une journee precise
 *
 * La simulation est le mode par defaut, et c'est deliberé : cette passe peut
 * decaler l'heure de cloture des pronostics. On regarde ce qu'elle veut faire
 * avant de la laisser le faire.
 */

const { syncSchedule } = require('../src/services/schedule-sync.service');

const args = process.argv.slice(2);
const force = args.includes('--force');

const iJ = args.indexOf('--j');
const rounds = iJ >= 0
  ? args.slice(iJ + 1).filter((a) => /^\d+$/.test(a)).map(Number)
  : null;

(async () => {
  try {
    const r = await syncSchedule({ dryRun: !force, rounds });
    console.log(JSON.stringify(r, null, 2));
    if (!force) console.log('\nSimulation : rien n\'a ete ecrit. Ajoute --force pour appliquer.');
    process.exit(r.ok ? 0 : 1);
  } catch (err) {
    console.error('ECHEC :', err.message);
    process.exit(1);
  }
})();
