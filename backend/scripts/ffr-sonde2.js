/**
 * Le type « rencontre_itl » de la FFR porte-t-il ce qu'il nous faut ?
 *
 * ---------------------------------------------------------------------------
 * LA PISTE
 * ---------------------------------------------------------------------------
 *
 * La premiere sonde a trouve, dans le catalogue des types de contenu de la
 * FFR, deux noms qui parlent : `rencontre_itl` — rencontre internationale, tres
 * probablement — et `competition`. Elle a trouve aussi que
 * `competition_classement_inter` rend seize « phases » numerotees contenant le
 * mot score.
 *
 * Trois pistes, donc, et ce script les suit jusqu'au bout : il regarde ce que
 * ces routes rendent vraiment, champ par champ, sur quelques elements.
 *
 * ---------------------------------------------------------------------------
 * LA QUESTION, TOUJOURS LA MEME
 * ---------------------------------------------------------------------------
 *
 * Une date, deux equipes, un score quand il existe. C'est tout ce qu'il faut
 * pour faire pronostiquer huit copains. Un type de contenu peut porter un titre
 * et une image sans porter aucune de ces trois choses — auquel cas c'est de
 * l'editorial, et ca ne nous sert a rien.
 *
 * Les champs qui comptent sont presque toujours dans `meta` : WordPress y range
 * ce qu'un type ajoute au tronc commun titre/contenu/date-de-publication. Le
 * script les affiche donc en entier, et le reste en resume.
 *
 * ---------------------------------------------------------------------------
 * USAGE
 * ---------------------------------------------------------------------------
 *
 *   node scripts/ffr-sonde2.js
 *   node scripts/ffr-sonde2.js --tout     (sans couper les valeurs)
 *
 * Lecture seule, aucune ecriture, la base n'est pas ouverte.
 */

const axios = require('axios');

const BASE = 'https://api.www.ffr.fr/wp-json';
const TOUT = process.argv.includes('--tout');
const dors = (ms) => new Promise((r) => setTimeout(r, ms));

const get = async (chemin) => {
  const res = await axios.get(`${BASE}${chemin}`, {
    timeout: 25000,
    headers: { 'User-Agent': 'top14-pronostics/1.0 (usage prive)' },
    validateStatus: () => true,
    maxContentLength: 40 * 1024 * 1024,
  });
  return res;
};

/** Une valeur, en une ligne lisible. */
const bref = (v) => {
  if (v === null || v === undefined) return String(v);
  if (typeof v === 'string') return TOUT || v.length < 90 ? `"${v}"` : `"${v.slice(0, 90)}…"`;
  if (Array.isArray(v)) return v.length ? `[${v.length}] ${bref(v[0])}` : '[]';
  if (typeof v === 'object') {
    const s = JSON.stringify(v);
    return TOUT || s.length < 150 ? s : `${s.slice(0, 150)}…`;
  }
  return String(v);
};

const titre = (t) => {
  console.log('\n' + '='.repeat(72));
  console.log(t);
  console.log('='.repeat(72));
};

(async () => {
  /* ---------------------------------------------------------------------- */
  /* 1. Sous quelle adresse ces types se lisent-ils                          */
  /* ---------------------------------------------------------------------- */

  titre('OU VIVENT « rencontre_itl » ET « competition »');

  const types = await get('/wp/v2/types');
  const routes = {};
  for (const nom of ['rencontre_itl', 'competition']) {
    const t = types.data?.[nom];
    if (!t) { console.log(`\n  ${nom} : absent du catalogue`); continue; }
    // rest_base est le nom sous lequel WordPress expose le type ; il ne suit
    // pas toujours le nom interne, et le deviner coute une requete pour rien.
    const base = t.rest_base || nom;
    const ns = t.rest_namespace || 'wp/v2';
    routes[nom] = `/${ns}/${base}`;
    console.log(`\n  ${nom}`);
    console.log(`    libelle   : ${t.name || '—'}`);
    console.log(`    adresse   : /${ns}/${base}`);
    console.log(`    taxonomies: ${(t.taxonomies || []).join(', ') || 'aucune'}`);
  }

  /* ---------------------------------------------------------------------- */
  /* 2. Ce que rend chacun, sur quelques elements                            */
  /* ---------------------------------------------------------------------- */

  for (const [nom, chemin] of Object.entries(routes)) {
    titre(`${nom.toUpperCase()} — LES ELEMENTS`);
    await dors(500);

    // Les plus recents d'abord : s'il y a du Tournoi 2027 quelque part, il est
    // recent ; et une liste vide se voit immediatement.
    const res = await get(`${chemin}?per_page=5&orderby=date&order=desc`);
    console.log(`\n  ${chemin}  ·  statut ${res.status}`);

    if (res.status >= 400) {
      console.log(`  ${res.data?.message || 'refuse'}`);
      continue;
    }
    if (!Array.isArray(res.data) || !res.data.length) {
      console.log('  aucun element publie');
      continue;
    }

    console.log(`  ${res.data.length} element(s) lus\n`);

    for (const el of res.data) {
      console.log('  ' + '-'.repeat(68));
      console.log(`  #${el.id}  ${bref(el.title?.rendered || el.title)}`);
      console.log(`    publie le ${el.date || '—'}   slug ${el.slug || '—'}`);

      // `meta` est l'endroit ou un type range ses champs propres : c'est la que
      // se trouveront une date de coup d'envoi et deux equipes, s'ils existent.
      const meta = el.meta || {};
      const clefs = Object.keys(meta);
      if (!clefs.length) {
        console.log('    meta : vide  <-- aucun champ propre, donc editorial');
      } else {
        console.log(`    meta (${clefs.length} champs) :`);
        for (const k of clefs) console.log(`      ${k.padEnd(28)} ${bref(meta[k])}`);
      }

      // Et les taxonomies attachees : c'est souvent la qu'on trouve « Tournoi
      // des Six Nations » ou « XV de France ».
      const autres = Object.keys(el).filter(
        (k) => !['id', 'date', 'date_gmt', 'guid', 'modified', 'modified_gmt', 'slug', 'status',
                 'type', 'link', 'title', 'content', 'excerpt', 'author', 'featured_media',
                 'template', 'meta', '_links', 'class_list'].includes(k)
      );
      for (const k of autres) console.log(`    ${k.padEnd(30)} ${bref(el[k])}`);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* 3. Les phases du classement international                               */
  /* ---------------------------------------------------------------------- */

  titre('LES SEIZE PHASES DU CLASSEMENT INTERNATIONAL');
  await dors(500);

  const cl = await get('/ffr/v1/competition_classement_inter');
  if (cl.status >= 400 || !cl.data || typeof cl.data !== 'object') {
    console.log(`\n  statut ${cl.status} — illisible`);
  } else {
    console.log(`
  Une phase est une competition ou une poule. On cherche celle qui porte le
  Tournoi : son nom suffira a savoir si la FFR publie les quinze rencontres
  ou seulement les cinq du XV de France.
`);
    for (const [clef, v] of Object.entries(cl.data)) {
      const nom =
        v?.nom || v?.name || v?.title || v?.libelle || v?.competition || v?.phase || null;
      const forme = Array.isArray(v) ? `tableau de ${v.length}` : `{ ${Object.keys(v || {}).slice(0, 10).join(', ')} }`;
      console.log(`  ${clef.padEnd(16)} ${nom ? `« ${nom} »` : ''}`);
      console.log(`  ${' '.repeat(16)} ${forme}`);
    }

    // Et une phase en entier, pour voir si elle porte des rencontres ou
    // seulement un tableau de classement.
    const [premiere, valeur] = Object.entries(cl.data)[0] || [];
    if (premiere) {
      console.log(`\n  ${premiere}, en detail :`);
      const s = JSON.stringify(valeur);
      console.log(`    ${s.slice(0, TOUT ? 4000 : 1200)}${s.length > 1200 && !TOUT ? '…' : ''}`);
    }
  }

  console.log(`

${'='.repeat(72)}
CE QU'IL FAUT Y LIRE
${'='.repeat(72)}

  Un element de rencontre_itl dont le « meta » porte une date de coup d'envoi
  et deux equipes : on tient la source, et il ne reste qu'a voir si elle couvre
  les quinze rencontres ou seulement les cinq francaises.

  Un « meta » vide : le type ne sert qu'a publier des pages de presentation,
  et son nom nous aura promis plus qu'il ne donne.

  Et dans les phases, un nom qui dit « Tournoi » ou « Six Nations » indique ou
  se trouvent les scores — ce qui est la seule donnee reellement mouvante, le
  calendrier etant fixe depuis mars.
`);
})().catch((e) => {
  console.error('\nEchec :', e.message);
  process.exit(1);
});
