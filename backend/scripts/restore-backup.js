#!/usr/bin/env node
/**
 * Restauration d'une sauvegarde.
 *
 *   node scripts/restore-backup.js top14-2026-09-28.json.gz.txt
 *   node scripts/restore-backup.js top14-2026-09-28.json.gz.txt --force
 *   node scripts/restore-backup.js top14-2026-09-28.json.gz.txt --force --remplacer
 *
 * Sans --force, le script se contente d'annoncer ce qu'il ferait. C'est
 * delibere : une restauration se lance en general dans un moment de panique, et
 * c'est exactement le moment ou l'on se trompe de fichier.
 *
 * `--remplacer` vide les tables avant d'ecrire, pour que la base devienne
 * identique a la sauvegarde. Sans lui, les donnees restaurees s'ajoutent a ce
 * qui se trouve deja la : sur une base vide le resultat est le meme, sur une
 * base qui contient deja quelque chose, non.
 *
 * Ce n'est pas une precaution theorique. Le premier exercice de restauration a
 * verse 182 rencontres dans une base locale qui en avait deja 182, avec
 * d'autres identifiants : on s'est retrouve avec 364 rencontres et quatorze
 * matchs par journee. C'est ce qui arriverait apres une perte partielle en
 * production — quelqu'un efface une table, on restaure par-dessus le reste.
 *
 * Une sauvegarde qu'on n'a jamais restauree n'est pas une sauvegarde, c'est un
 * espoir. Celle-ci a ete restauree, et l'exercice a trouve un defaut : c'est
 * precisement a ca qu'il sert.
 */

const fs = require('fs');
const path = require('path');
const { restore, parseDump, cible } = require('../src/services/backup.service');

async function main() {
  const [fichier, ...reste] = process.argv.slice(2);
  const force = reste.includes('--force');
  const remplacer = reste.includes('--remplacer');

  if (!fichier) {
    console.error('Usage : node scripts/restore-backup.js <fichier.json[.gz]> [--force] [--remplacer]');
    process.exit(1);
  }
  if (!fs.existsSync(fichier)) {
    console.error(`Fichier introuvable : ${path.resolve(fichier)}`);
    process.exit(1);
  }

  /**
   * La base visee, annoncee avant toute chose.
   *
   * La commande est la meme pour la base locale et pour la production ; seule
   * l'adresse change, et elle vit dans un fichier qu'on ne regarde pas. Un
   * outil qui ne dit pas sur quoi il travaille finit par travailler sur autre
   * chose que ce qu'on croyait — on s'est deja fait peur avec ca.
   */
  console.log(`Base visee : ${cible()}`);

  const dump = await parseDump(fs.readFileSync(fichier));
  console.log(`Sauvegarde du ${dump.exportedAt}, format ${dump.format}`);
  console.log(
    dump.passwordsIncluded
      ? 'Mots de passe : inclus, les comptes seront restaures tels quels.'
      : 'Mots de passe : absents. Les comptes recrees devront passer par « mot de passe oublie ».'
  );
  console.log(
    remplacer
      ? 'Mode : REMPLACEMENT — les tables seront videes avant l ecriture.'
      : 'Mode : ajout — les donnees restaurees s ajoutent a ce qui est deja en base.'
  );

  const res = await restore(dump, { dryRun: !force, remplacer });

  console.log('\nContenu de la sauvegarde :');
  for (const [table, n] of Object.entries(res.plan)) {
    if (n) console.log(`  ${table.padEnd(14)} ${n}`);
  }

  if (res.efface) {
    console.log('\nCe qui serait efface avant :');
    for (const [table, n] of Object.entries(res.efface)) {
      if (n) console.log(`  ${table.padEnd(14)} ${n}`);
    }
  }

  if (res.dryRun) {
    console.log('\nSimulation : rien n a ete ecrit.');
    console.log(
      remplacer
        ? 'Relance avec --force --remplacer pour vider puis restaurer.'
        : 'Relance avec --force pour restaurer, ou ajoute --remplacer pour repartir d une base vide.'
    );
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
