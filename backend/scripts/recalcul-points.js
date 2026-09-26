#!/usr/bin/env node
/**
 * Recalcule les points de tous les pronostics deja notes.
 *
 *   node scripts/recalcul-points.js            simulation, rien n'est ecrit
 *   node scripts/recalcul-points.js --force    ecrit
 *
 * A lancer apres un changement de bareme. Il rejoue `calculatePoints` sur
 * chaque rencontre terminee, donc il applique exactement la meme regle que la
 * synchronisation : il n'y a pas deux endroits ou le bareme est ecrit, et donc
 * pas de risque qu'ils divergent.
 *
 * La simulation affiche le detail des lignes qui changent et le bilan par
 * joueur. C'est ce qu'il faut regarder avant d'accepter : un recalcul modifie
 * le classement, et il vaut mieux savoir de combien avant que les copains le
 * decouvrent.
 */

const { PrismaClient } = require('@prisma/client');
const { pointsFor } = require('../src/services/scoring');
const { multiplicateur } = require('../src/services/rules');
const { calculatePoints } = require('../src/controllers/match.controller');

const prisma = new PrismaClient();
const SEASON = process.env.SPORTSDB_SEASON || '2026-2027';
const force = process.argv.includes('--force');

(async () => {
  try {
    const matchs = await prisma.match.findMany({
      where: { season: SEASON, status: 'FINISHED' },
      orderBy: [{ round: 'asc' }, { kickoff: 'asc' }],
    });

    // L'affiche de chaque journee, pour reproduire le multiplicateur.
    const parJournee = new Map();
    for (const m of matchs) {
      if (!parJournee.has(m.round)) parJournee.set(m.round, []);
      parJournee.get(m.round).push(m);
    }

    const pronos = await prisma.prediction.findMany({
      where: { match: { season: SEASON, status: 'FINISHED' } },
      include: { user: { select: { username: true } }, match: true },
    });

    const bilan = new Map();
    const changements = [];

    for (const p of pronos) {
      const m = p.match;
      const base = pointsFor(p, m);
      const total = base * multiplicateur({ joker: p.joker, affiche: m.featured, round: m.round });

      const avant = p.points ?? 0;
      if (!bilan.has(p.user.username)) bilan.set(p.user.username, { avant: 0, apres: 0 });
      const b = bilan.get(p.user.username);
      b.avant += avant;
      b.apres += total;

      if (total !== avant || base !== p.basePoints) {
        changements.push(
          `J${m.round} ${p.user.username.padEnd(14)} ${String(p.homeScorePred + '-' + p.awayScorePred).padEnd(8)}` +
          ` sur ${String(m.homeScore + '-' + m.awayScore).padEnd(8)} : ${avant} -> ${total}`
        );
      }
    }

    console.log(`${pronos.length} pronostic(s) sur ${matchs.length} rencontre(s) terminee(s)`);
    console.log(`${changements.length} changement(s)\n`);
    for (const c of changements) console.log('  ' + c);

    console.log('\n  Bilan par joueur');
    const lignes = [...bilan.entries()].sort((a, b) => b[1].apres - a[1].apres);
    for (const [nom, b] of lignes) {
      const d = b.apres - b.avant;
      console.log(`  ${nom.padEnd(16)} ${String(b.avant).padStart(4)} -> ${String(b.apres).padStart(4)}  (${d >= 0 ? '+' : ''}${d})`);
    }

    if (!force) {
      console.log('\nSimulation : rien n\'a ete ecrit. Ajoute --force pour appliquer.');
      return;
    }

    for (const m of matchs) await calculatePoints(m);
    console.log(`\n${matchs.length} rencontre(s) recalculee(s).`);
  } catch (err) {
    console.error('ECHEC :', err.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
