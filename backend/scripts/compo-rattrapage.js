/**
 * Remettre a l'endroit les compositions des journees deja jouees.
 *
 * ---------------------------------------------------------------------------
 * POURQUOI IL FAUT UN SCRIPT, ET PAS UNE REQUETE SQL
 * ---------------------------------------------------------------------------
 *
 * Les compositions en base ont les deux camps intervertis environ une fois sur
 * deux, selon que la feuille de match portait ou non l'attribut
 * `visiting-first`. On pourrait etre tente de les retourner sur place avec une
 * requete : ce serait une faute. On ignore, pour chaque ligne deja ecrite,
 * laquelle etait a l'endroit — l'information n'a jamais ete enregistree, et
 * c'est precisement ce qui manquait.
 *
 * On ne devine donc rien : on relit les feuilles a la source, avec l'analyseur
 * corrige, et on reecrit. Quatorze requetes pour deux journees, soixante-dix
 * pour dix. C'est lent et c'est juste.
 *
 * ---------------------------------------------------------------------------
 * POURQUOI LE CRON NE LE FERA PAS TOUT SEUL
 * ---------------------------------------------------------------------------
 *
 * Le service de synchronisation ne touche jamais a une rencontre terminee, et
 * c'est une bonne regle : une feuille de match jouee ne bouge plus, la relire
 * serait une requete pour rien. Les journees a reparer sont justement toutes
 * terminees. Ce script est donc le seul endroit ou cette regle est levee, par
 * un parametre passe a la main — jamais depuis un cron, jamais par defaut.
 *
 * ---------------------------------------------------------------------------
 * USAGE
 * ---------------------------------------------------------------------------
 *
 *   node scripts/compo-rattrapage.js              simulation, toutes les journees
 *   node scripts/compo-rattrapage.js 5 6          simulation, J5 et J6
 *   node scripts/compo-rattrapage.js --ecrire     pour de vrai
 *   node scripts/compo-rattrapage.js 6 --ecrire   pour de vrai, J6 seule
 *
 * Par defaut il ne touche a rien et dit ce qu'il ferait. L'ecriture se demande
 * explicitement : ce script reecrit des donnees existantes, ce qui n'est pas le
 * genre d'operation qu'on lance par inadvertance en remontant dans l'historique
 * du terminal.
 */

const { PrismaClient } = require('@prisma/client');
const { syncCompositions } = require('../src/services/composition-sync.service');

const prisma = new PrismaClient();
const SEASON = process.env.SPORTSDB_SEASON || '2026-2027';

const args = process.argv.slice(2);
const ECRIRE = args.includes('--ecrire');
const ROUNDS = args.filter((a) => /^\d+$/.test(a)).map(Number);

(async () => {
  // Les journees qui ont au moins une composition en base, ou toutes celles
  // deja jouees : ce sont les candidates au rattrapage.
  let cibles = ROUNDS;
  if (!cibles.length) {
    const lignes = await prisma.match.findMany({
      where: { season: SEASON, compositionAt: { not: null } },
      select: { round: true },
      distinct: ['round'],
      orderBy: { round: 'asc' },
    });
    cibles = lignes.map((l) => l.round);
  }

  if (!cibles.length) {
    console.log('\nAucune journee avec composition en base. Rien a rattraper.\n');
    await prisma.$disconnect();
    return;
  }

  console.log(`\nSaison ${SEASON} — rattrapage des compositions`);
  console.log(`Journees : J${cibles.join(', J')}`);
  console.log(ECRIRE ? 'Mode : ECRITURE\n' : 'Mode : simulation (rien ne sera ecrit)\n');

  const r = await syncCompositions({
    rounds: cibles,
    inclureTerminees: true,
    dryRun: !ECRIRE,
    verbose: true,
  });

  console.log('\n' + '='.repeat(70));
  console.log('RESULTAT');
  console.log('='.repeat(70));
  console.log(`  reecrites   : ${r.updated}`);
  console.log(`  inchangees  : ${r.skipped}`);
  console.log(`  en attente  : ${r.enAttente}`);
  console.log(`  refusees    : ${r.refusees}`);

  if (r.unmatched.length) {
    console.log('\n  refus et anomalies :');
    for (const u of r.unmatched) console.log(`    ${u}`);
  }

  /*
   * L'ordre rencontre, journee par journee.
   *
   * C'est la verification qui compte : si « visiteur-en-premier » n'apparait
   * jamais, c'est que l'attribut n'est pas lu et que rien n'a ete repare. S'il
   * apparait sur une partie des rencontres, le correctif fait son travail.
   */
  const ordres = r.apercus.reduce((acc, a) => {
    acc[a.ordre] = (acc[a.ordre] || 0) + 1;
    return acc;
  }, {});
  console.log('\n  ordre des blocs rencontre :');
  for (const [k, v] of Object.entries(ordres)) console.log(`    ${k} : ${v}`);

  console.log('\n' + '='.repeat(70));
  console.log('LES QUINZE, A VERIFIER A L\'OEIL');
  console.log('='.repeat(70));
  console.log(`
  Trois premiers noms de chaque camp. C'est court, et c'est suffisant : il
  faut juste reconnaitre que le quinze range sous un club est bien le sien.
`);
  for (const a of r.apercus) {
    console.log(`  ${a.match}`);
    console.log(`    recevant : ${a.home.slice(0, 3).join(' · ')}`);
    console.log(`    visiteur : ${a.away.slice(0, 3).join(' · ')}`);
  }

  if (!ECRIRE) {
    console.log(`
--------------------------------------------------------------------
  Simulation. Rien n'a ete ecrit.
  Si les quinze ci-dessus sont ranges sous le bon club, relancer avec :

      node scripts/compo-rattrapage.js --ecrire
--------------------------------------------------------------------
`);
  }

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('\nEchec :', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
