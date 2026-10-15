/**
 * Que lit-on reellement sur la page de la LNR ?
 *
 * ---------------------------------------------------------------------------
 * LES DEUX QUESTIONS
 * ---------------------------------------------------------------------------
 *
 * Les compositions en base sont rattachees a la mauvaise rencontre. Deux
 * explications tenaient debout a la lecture du code, et aucune n'a ete
 * verifiee sur la vraie page :
 *
 *   1. Le decoupage des blocs commence a `class="calendar-results__line"`, donc
 *      au milieu de la balise. Si le `href` de la feuille de match est ecrit
 *      AVANT cet attribut, il tombe hors de sa propre tranche et dans celle du
 *      bloc precedent. Chaque rencontre recupere alors l'adresse de la
 *      suivante — un decalage d'un cran, silencieux et systematique.
 *
 *   2. Le garde-fou de composition-sync ne se declenche que si `lu.homeTeam`
 *      est renseigne. S'il revient vide, la condition est morte et n'importe
 *      quelle feuille passe.
 *
 * Ce script ne corrige rien. Il va chercher la page et repond par oui ou par
 * non aux deux, parce qu'une correction fondee sur une lecture de code est une
 * supposition, et qu'on s'est deja trompe une fois aujourd'hui.
 *
 * ---------------------------------------------------------------------------
 * USAGE
 * ---------------------------------------------------------------------------
 *
 *   node scripts/lnr-sonde.js        (journee 6)
 *   node scripts/lnr-sonde.js 7
 *
 * Lecture seule : deux ou trois requetes vers la LNR, aucune ecriture en base.
 * La base n'est meme pas ouverte.
 */

const axios = require('axios');
const lnr = require('../src/services/sources/lnr');
const compos = require('../src/services/sources/lnr-compositions');

const BASE = process.env.LNR_BASE || 'https://top14.lnr.fr';
const SEASON = process.env.LNR_SEASON || '2026-2027';
const ROUND = parseInt(process.argv[2] || '6', 10);

const RE_SHEET = /feuille-de-match\/[^/"]+\/j(\d+)\/(\d+)-([a-z0-9-]+)/g;

(async () => {
  const url = `${BASE}/calendrier-et-resultats/${SEASON}/j${ROUND}`;
  console.log(`\n${url}\n`);

  const page = String((await axios.get(url, {
    timeout: 15000,
    headers: { 'User-Agent': 'top14-pronostics/1.0 (usage prive)' },
  })).data);

  console.log(`page recue : ${page.length} caracteres\n`);

  /* ====================================================================== */
  /* QUESTION 1 — l'adresse de la feuille est-elle avant ou apres la marque */
  /* ====================================================================== */

  console.log('='.repeat(70));
  console.log('OU SE TROUVE LE LIEN DE LA FEUILLE, PAR RAPPORT A LA MARQUE DE BLOC');
  console.log('='.repeat(70));

  const marques = [];
  const reMarque = /class="calendar-results__line"/g;
  let m;
  while ((m = reMarque.exec(page))) marques.push(m.index);

  const feuilles = [];
  RE_SHEET.lastIndex = 0;
  while ((m = RE_SHEET.exec(page))) {
    if (!feuilles.some((f) => f.chemin === m[0])) {
      feuilles.push({ pos: m.index, chemin: m[0], slugs: m[3] });
    }
  }

  console.log(`\n  ${marques.length} marques de bloc, ${feuilles.length} feuilles distinctes\n`);

  /*
   * La reponse tient dans une comparaison de positions. Pour chaque feuille, on
   * regarde combien de marques la precedent : si le lien est ecrit avant sa
   * propre marque, il se retrouve systematiquement dans la tranche du bloc d'au
   * -dessus, et l'ecart sera d'un cran.
   */
  console.log('  feuille                                 pos      marque la plus proche');
  console.log('  ' + '-'.repeat(66));
  for (const f of feuilles) {
    const avant = marques.filter((p) => p < f.pos).length;
    const prochaine = marques.find((p) => p > f.pos);
    const ecartAvant = avant ? f.pos - marques[avant - 1] : null;
    const ecartApres = prochaine ? prochaine - f.pos : null;
    const cote =
      ecartApres !== null && (ecartAvant === null || ecartApres < ecartAvant)
        ? `AVANT la marque ${avant + 1} (de ${ecartApres} car.)`
        : `apres la marque ${avant} (de ${ecartAvant} car.)`;
    console.log(`  ${f.slugs.slice(0, 36).padEnd(38)} ${String(f.pos).padStart(7)}   ${cote}`);
  }

  console.log(`
  A lire ainsi : « AVANT la marque N » pour toutes les feuilles confirme le
  decalage d'un cran — chaque bloc contient le lien du bloc suivant. « apres »
  partout innocente le decoupage, et il faudra chercher ailleurs.
`);

  /* ====================================================================== */
  /* QUESTION 1 bis — ce que l'analyseur actuel en tire                     */
  /* ====================================================================== */

  console.log('='.repeat(70));
  console.log('CE QUE L\'ANALYSEUR ACTUEL ASSOCIE A CHAQUE RENCONTRE');
  console.log('='.repeat(70));
  console.log(`
  Le test decisif : les slugs ecrits dans l'adresse de la feuille sont-ils
  ceux des deux clubs de la rencontre ? Ils y figurent en clair, donc la
  verification ne coute rien — et c'est elle qui, une fois dans le code,
  rendra ce defaut impossible a reproduire.
`);

  const { matchs } = lnr.parseRound(page);
  let faux = 0;

  console.log('  rencontre                                   feuille associee');
  console.log('  ' + '-'.repeat(66));
  for (const x of matchs) {
    const chemin = x.sheet || '—';
    const attendu = chemin.includes(x.homeSlug) && chemin.includes(x.awaySlug);
    if (!attendu) faux++;
    const affiche = `${x.homeSlug} – ${x.awaySlug}`;
    console.log(
      `  ${affiche.slice(0, 40).padEnd(42)} ${chemin.split('/').pop().slice(0, 30)}` +
      `${attendu ? '' : '   <-- NE CORRESPOND PAS'}`
    );
  }

  console.log(`\n  ${faux} rencontre(s) sur ${matchs.length} associee(s) a la mauvaise feuille.\n`);

  /* ====================================================================== */
  /* QUESTION 2 — le garde-fou peut-il encore se declencher                 */
  /* ====================================================================== */

  console.log('='.repeat(70));
  console.log('LE GARDE-FOU : LA FEUILLE ANNONCE-T-ELLE SON CLUB RECEVANT ?');
  console.log('='.repeat(70));
  console.log(`
  composition-sync refuse d'ecrire quand la feuille lue annonce un autre
  recevant que la rencontre visee — mais seulement si elle l'annonce. On lit
  donc deux feuilles et on regarde ce que le champ homeTeam vaut reellement.
`);

  for (const x of matchs.slice(0, 2)) {
    if (!x.sheet) continue;
    const u = compos.urlCompositions(x.sheet);
    console.log(`  ${u}`);
    try {
      const lu = await compos.fetchCompositions(x.sheet);
      console.log(`    homeTeam lu   : ${lu.homeTeam === null ? 'null  <-- GARDE-FOU DESARME' : `« ${lu.homeTeam} »`}`);
      console.log(`    awayTeam lu   : ${lu.awayTeam === null ? 'null' : `« ${lu.awayTeam} »`}`);
      console.log(`    attendu       : « ${x.homeTeam} » / « ${x.awayTeam} »`);
      console.log(`    complete      : ${lu.complete}  (${lu.home.titulaires.length}+${lu.home.remplacants.length} / ${lu.away.titulaires.length}+${lu.away.remplacants.length})`);
      console.log(`    3 premiers    : ${lu.home.titulaires.slice(0, 3).map((j) => j.nom).join(', ') || '—'}`);
    } catch (err) {
      console.log(`    ECHEC : ${err.message}`);
    }
    console.log('');
    await new Promise((r) => setTimeout(r, 600));
  }

  console.log(`
  Si « homeTeam lu » vaut null, le garde-fou est mort depuis le debut et c'est
  la deuxieme reparation. S'il est renseigne mais differe du nom attendu, alors
  le garde-fou aurait du parler, et c'est la comparaison des libelles qu'il faut
  revoir — « ASM Clermont » contre « ASM Clermont Auvergne », par exemple.
`);
})().catch((e) => {
  console.error('\nEchec :', e.message);
  process.exit(1);
});
