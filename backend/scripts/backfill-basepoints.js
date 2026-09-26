#!/usr/bin/env node
/**
 * Remplit `basePoints` sur les pronostics deja notes.
 *
 *   node scripts/backfill-basepoints.js            simulation
 *   node scripts/backfill-basepoints.js --force    ecrit
 *
 * Pourquoi c'est sur. Avant l'introduction des multiplicateurs, `points`
 * portait directement la valeur du bareme, de 0 a 3 : les deux colonnes
 * auraient ete egales si la seconde avait existe. Recopier l'une dans l'autre
 * ne reecrit donc aucune note, ca comble un trou.
 *
 * Le code sait deja lire une colonne vide — partout ou il compte les scores
 * exacts, il retombe sur `points` quand `basePoints` est nul. Ce script n'est
 * donc pas indispensable ; il evite simplement de trainer ce repli pendant
 * toute la saison, et rend les donnees lisibles pour qui les regardera plus
 * tard.
 *
 * Par prudence il refuse de toucher une ligne dont `points` depasse 3 : ce
 * serait une note deja multipliee, donc une ligne posterieure a ce script, et
 * la recopier ecraserait le bareme par le total.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const force = process.argv.includes('--force');

(async () => {
  try {
    const candidates = await prisma.prediction.findMany({
      where: { basePoints: null, points: { not: null } },
      select: { id: true, points: true },
    });

    const sains = candidates.filter((p) => p.points >= 0 && p.points <= 3);
    const suspects = candidates.filter((p) => p.points > 3);

    console.log(`${candidates.length} pronostic(s) sans basePoints`);
    console.log(`  ${sains.length} a recopier`);
    if (suspects.length) {
      console.warn(`  ${suspects.length} ignore(s) : points > 3, donc deja multiplie(s)`);
      console.warn('  ids :', suspects.map((p) => p.id).join(', '));
    }

    if (!force) {
      console.log('\nSimulation : rien n\'a ete ecrit. Ajoute --force pour appliquer.');
      return;
    }

    // Un groupe par valeur : quatre requetes au lieu d'une par ligne.
    let ecrits = 0;
    for (const valeur of [0, 1, 2, 3]) {
      const ids = sains.filter((p) => p.points === valeur).map((p) => p.id);
      if (!ids.length) continue;
      const r = await prisma.prediction.updateMany({
        where: { id: { in: ids } },
        data: { basePoints: valeur },
      });
      ecrits += r.count;
    }

    console.log(`\n${ecrits} ligne(s) completee(s).`);
  } catch (err) {
    console.error('ECHEC :', err.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
