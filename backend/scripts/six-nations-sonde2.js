/**
 * Quinze dates, zero equipe : sous quelle forme sont-elles ecrites ?
 *
 * ---------------------------------------------------------------------------
 * CE QUE LA PREMIERE SONDE A VRAIMENT DIT
 * ---------------------------------------------------------------------------
 *
 * Elle a conclu que la donnee n'etait pas dans la page. C'etait trop vite dit :
 * elle avait trouve **exactement quinze dates ISO** dans l'edition 2027. Quinze
 * rencontres, quinze dates. Une page qui se construirait entierement dans le
 * navigateur n'en contiendrait aucune.
 *
 * Ce qu'elle n'a pas trouve, ce sont les equipes — parce qu'elle les cherchait
 * sous la forme « FRA », « SCO », vue a l'ecran. Rien ne dit que la donnee les
 * ecrive ainsi : l'affichage abrege peut-etre des noms complets, ou resoudre
 * des identifiants. On a devine une forme au lieu de la lire.
 *
 * Et l'edition 2026, deja jouee, ne rend aucune date : une rencontre terminee
 * n'affiche plus d'horaire mais un score. C'est exactement ce qu'on avait
 * rencontre sur la LNR, ou `match-line__time` disparait apres le coup d'envoi.
 * Deux formes a lire, donc, pas une.
 *
 * ---------------------------------------------------------------------------
 * CE QUE CE SCRIPT FAIT
 * ---------------------------------------------------------------------------
 *
 * Il montre la donnee au lieu d'en tester l'idee qu'on s'en fait. Autour de
 * chacune des quinze dates, il affiche le texte qui l'entoure, debarrasse de ses
 * echappements. Si les equipes sont la, elles seront visibles a l'oeil, sous
 * quelque forme que ce soit — nom, code, identifiant, slug.
 *
 * Il cherche aussi les six nations sous toutes leurs ecritures plausibles, et
 * compte les mots qui accompagnent une rencontre.
 *
 * ---------------------------------------------------------------------------
 * USAGE
 * ---------------------------------------------------------------------------
 *
 *   node scripts/six-nations-sonde2.js
 *   node scripts/six-nations-sonde2.js 202600
 *
 * Lecture seule.
 */

const axios = require('axios');

const BASE = 'https://www.sixnationsrugby.com';
const CIBLES = (() => {
  const s = process.argv.slice(2).filter((a) => /^\d{6}$/.test(a));
  return s.length ? s : ['202700', '202600'];
})();

/**
 * Le HTML d'une page moderne embarque son JSON echappe : les guillemets y sont
 * precedes d'antislashs, les accents encodes. On nettoie avant de regarder,
 * sans quoi on lit du bruit et on conclut a tort qu'il n'y a rien.
 */
const lisible = (s) =>
  String(s)
    .replace(/\\"/g, '"')
    .replace(/\\u0026/g, '&')
    .replace(/\\n/g, ' ')
    .replace(/\\/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const NATIONS = {
  France: [/\bFrance\b/g, /"FRA"/g, /\bfra\b/g, /france/gi],
  England: [/\bEngland\b/g, /"ENG"/g, /\beng\b/g],
  Ireland: [/\bIreland\b/g, /"IRE"/g, /\bire\b/g],
  Scotland: [/\bScotland\b/g, /"SCO"/g, /\bsco\b/g],
  Wales: [/\bWales\b/g, /"WAL"/g, /\bwal\b/g],
  Italy: [/\bItaly\b/g, /"ITA"/g, /\bita\b/g],
};

(async () => {
  for (const saison of CIBLES) {
    const url = `${BASE}/en/m6n/fixtures/${saison}`;
    console.log('\n' + '='.repeat(74));
    console.log(`${url}   (edition ${saison.slice(0, 4)})`);
    console.log('='.repeat(74));

    let html;
    try {
      const res = await axios.get(url, {
        timeout: 25000,
        headers: {
          'User-Agent': 'top14-pronostics/1.0 (usage prive)',
          'Accept-Language': 'en;q=0.9',
        },
        maxContentLength: 30 * 1024 * 1024,
      });
      html = String(res.data);
    } catch (err) {
      console.log(`\n  ECHEC : ${err.message}`);
      continue;
    }

    const clair = lisible(html);

    /* -------------------------------------------------------------------- */
    /* 1. Les nations, sous toutes leurs ecritures                           */
    /* -------------------------------------------------------------------- */

    console.log('\n  les six nations, selon la forme cherchee :');
    for (const [nom, formes] of Object.entries(NATIONS)) {
      const comptes = formes.map((re) => (clair.match(re) || []).length);
      console.log(`    ${nom.padEnd(9)} ${formes.map((re, i) => `${String(re).slice(0, 18)} ${comptes[i]}`).join('   ')}`);
    }

    /* -------------------------------------------------------------------- */
    /* 2. Les mots qui accompagnent une rencontre                            */
    /* -------------------------------------------------------------------- */

    const mots = ['kickOff', 'kickoff', 'venue', 'stadium', 'homeTeam', 'awayTeam',
                  'teams', 'score', 'result', 'round', 'matchId', 'fixture'];
    console.log('\n  mots-clefs de rencontre :');
    console.log('    ' + mots.map((m) => `${m} ${(clair.match(new RegExp(m, 'g')) || []).length}`).join('   '));

    /* -------------------------------------------------------------------- */
    /* 3. Ce qui entoure chaque date                                         */
    /* -------------------------------------------------------------------- */

    const dates = [];
    const re = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?/g;
    let m;
    while ((m = re.exec(clair))) dates.push({ pos: m.index, quoi: m[0] });

    console.log(`\n  ${dates.length} date(s) trouvee(s). Ce qui les entoure :\n`);

    for (const d of dates.slice(0, 16)) {
      const avant = clair.slice(Math.max(0, d.pos - 260), d.pos);
      const apres = clair.slice(d.pos, d.pos + 260);
      console.log('  ' + '-'.repeat(70));
      console.log(`  ${d.quoi}`);
      console.log(`    avant : …${avant.slice(-240)}`);
      console.log(`    apres : ${apres}…`);
    }

    if (!dates.length) {
      /*
       * Pas de date : l'edition est jouee et la page affiche des scores. On
       * montre alors ce qui entoure le mot « venue », seul repere trouve par la
       * premiere sonde, pour voir sous quelle forme la rencontre est ecrite.
       */
      console.log('  Aucune date — edition jouee. Ce qui entoure « venue » :\n');
      const v = /venue/gi;
      let k, n = 0;
      while ((k = v.exec(clair)) && n < 4) {
        console.log('  ' + '-'.repeat(70));
        console.log(`    …${clair.slice(Math.max(0, k.index - 300), k.index + 400)}…`);
        n++;
      }
    }

    await new Promise((r) => setTimeout(r, 800));
  }

  console.log(`

${'='.repeat(74)}
CE QU'IL FAUT Y LIRE
${'='.repeat(74)}

  Des noms d'equipes autour des dates, sous quelque forme que ce soit : la
  donnee est dans la page et un analyseur est possible. On saura du meme coup
  comment elle nomme les clubs, ce qui est la moitie du travail.

  Des identifiants numeriques et aucun nom : la page renvoie a un referentiel
  d'equipes charge ailleurs. C'est faisable, mais cela veut dire deux requetes
  et une table de correspondance a tenir — exactement le genre de dette qu'on
  accepte pour 182 rencontres et pas pour quinze.

  Rien autour des dates : ce sont des dates d'autre chose (publication,
  droits), la page se construit bien dans le navigateur, et on saisit les
  quinze lignes a la main sans plus y penser.
`);
})().catch((e) => {
  console.error('\nEchec :', e.message);
  process.exit(1);
});
