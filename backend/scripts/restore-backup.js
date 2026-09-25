#!/usr/bin/env node
/**
 * Restauration d'une sauvegarde.
 *
 *   node scripts/restore-backup.js top14-2026-09-25.json.gz
 *   node scripts/restore-backup.js top14-2026-09-25.json.gz --force
 *
 * Sans --force, le script se contente d'annoncer ce qu'il ferait. C'est
 * deliberé : une restauration se lance en general dans un moment de panique,
 * et c'est exactement le moment ou l'on se trompe de fichier.
 *
 * Une sauvegarde qu'on n'a jamais restauree n'est pas une sauvegarde, c'est un
 * espoir. Lance ce script au moins une fois, en mode simulation, le jour ou tu
 * l'installes — pour savoir qu'il marche avant d'en avoir besoin.
 */

const fs = require('fs');
const path = require('path');
const { restore, parseDump } = require('../src/services/backup.service');

async function main() {
  const [fichier, ...reste] = process.argv.slice(2);
  const force = reste.includes('--force');

  if (!fichier) {
    console.error('Usage : node scripts/restore-backup.js <fichier.json[.gz]> [--force]');
    process.exit(1);
  }
  if (!fs.existsSync(fichier)) {
    console.error(`Fichier introuvable : ${path.resolve(fichier)}`);
    process.exit(1);
  }

  const dump = await parseDump(fs.readFileSync(fichier));
  console.log(`Sauvegarde du ${dump.exportedAt}, format ${dump.format}`);
  console.log(
    dump.passwordsIncluded
      ? 'Mots de passe : inclus, les comptes seront restaures tels quels.'
      : 'Mots de passe : absents. Les comptes recrees devront passer par « mot de passe oublie ».'
  );

  const res = await restore(dump, { dryRun: !force });
  for (const [table, n] of Object.entries(res.plan)) {
    if (n) console.log(`  ${table.padEnd(14)} ${n}`);
  }

  if (res.dryRun) {
    console.log('\nSimulation : rien n a ete ecrit. Relance avec --force pour restaurer.');
  } else {
    console.log('\nRestauration terminee. Les sequences d identifiants ont ete recalees.');
    if (res.aReinitialiser?.length) {
      console.log('\nComptes recrees sans mot de passe utilisable — previens-les :');
      for (const u of res.aReinitialiser) console.log(`  ${u}`);
    }
  }
}

main().catch((err) => {
  console.error('Echec :', err.message);
  process.exit(1);
});
