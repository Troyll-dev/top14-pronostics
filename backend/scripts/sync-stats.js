/**
 * Lit les statistiques des rencontres terminees, et affiche la forme des clubs.
 *
 *   node scripts/sync-stats.js                    simulation, rien n'est ecrit
 *   node scripts/sync-stats.js --force            ecrit en base
 *   node scripts/sync-stats.js --round 4 --force  une journee precise
 *   node scripts/sync-stats.js --forme            n'affiche que le cumul actuel
 *   node scripts/sync-stats.js --forme --avant 5  la forme telle qu'avant la J5
 *
 * Le rattrapage se fait tout seul : la liste des rencontres a lire se construit
 * sur l'etat de la base — « terminee et sans statistiques ». Lance-le autant de
 * fois que tu veux, il ne relira jamais deux fois la meme page.
 */

const { syncStats, forme } = require('../src/services/team-stats.service');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const force = args.includes('--force');
const seulementForme = args.includes('--forme');
const lire = (nom) => {
  const i = args.indexOf(nom);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : null;
};
const round = lire('--round');
const avant = lire('--avant');

async function afficherForme(avantRound) {
  const f = await forme(avantRound ? { avantRound } : {});
  const teams = await prisma.team.findMany({ select: { id: true, name: true } });
  const nom = new Map(teams.map((t) => [t.id, t.name]));

  const lignes = Object.entries(f)
    .map(([id, x]) => ({ nom: nom.get(Number(id)) || `#${id}`, ...x }))
    .sort((a, b) => (b.essaisPourParMatch || 0) - (a.essaisPourParMatch || 0));

  if (!lignes.length) {
    console.log('Aucune statistique en base : lance d\'abord la lecture avec --force.');
    return;
  }

  console.log('');
  console.log(avantRound ? `=== FORME AVANT LA J${avantRound} ===` : '=== FORME ACTUELLE ===');
  console.log(
    'club'.padEnd(24) + 'J'.padStart(3) +
    'essais+'.padStart(9) + 'essais-'.padStart(9) +
    'pts+'.padStart(7) + 'pts-'.padStart(7) +
    'pen.'.padStart(7) + 'plaq.rat'.padStart(10)
  );
  for (const l of lignes) {
    console.log(
      String(l.nom).padEnd(24) +
      String(l.matchs).padStart(3) +
      String(l.essaisPourParMatch ?? '-').padStart(9) +
      String(l.essaisContreParMatch ?? '-').padStart(9) +
      String(l.pointsPourParMatch ?? '-').padStart(7) +
      String(l.pointsContreParMatch ?? '-').padStart(7) +
      String(l.penalitesParMatch ?? '-').padStart(7) +
      String(l.plaquagesManquesParMatch ?? '-').padStart(10)
    );
  }
  console.log('(par match)');
}

(async () => {
  if (!seulementForme) {
    const r = await syncStats({ dryRun: !force, rounds: round ? [round] : null });

    console.log('');
    console.log(force ? '=== ECRITURE ===' : '=== SIMULATION (aucune ecriture) ===');
    console.log('Journees :', r.rounds.join(', ') || '(aucune)');
    for (const [k, v] of Object.entries(r.sources)) console.log(`  ${k} : ${v}`);
    if (r.reason) console.log(r.reason);
    for (const c of r.changes) console.log(`  ${c}`);
    for (const u of r.unmatched) console.log(`  ! ${u}`);
    console.log(
      `${r.updated} rencontre(s) ${force ? 'enregistree(s)' : 'a enregistrer'}, ` +
      `${r.skipped} deja connue(s), ${r.enAttente} en attente`
    );
    if (!r.ok) console.log('Des erreurs ont ete rencontrees : relire les lignes ci-dessus.');
  }

  await afficherForme(avant);
  process.exit(0);
})().catch((err) => {
  console.error('ECHEC :', err.message);
  process.exit(1);
});
