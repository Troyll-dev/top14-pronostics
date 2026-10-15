/**
 * Comment s'ecrit une rencontre DEJA JOUEE ?
 *
 * ---------------------------------------------------------------------------
 * LE DERNIER TROU
 * ---------------------------------------------------------------------------
 *
 * On sait lire le calendrier : les quinze rencontres de 2027 sont dans la page,
 * chacune avec ses deux nations en code a trois lettres et son coup d'envoi en
 * UTC, a l'interieur d'une carte `fixturesResultsCard`.
 *
 * Mais l'edition 2026, jouee, ne contient aucune date : une rencontre terminee
 * affiche un score, pas une heure. C'est la meme bascule que sur la LNR, ou
 * `match-line__time` disparait apres le coup d'envoi — et c'est ce qui avait
 * failli faire conclure a tort que la page etait vide.
 *
 * Or le score est la seule donnee reellement mouvante. Le calendrier sera fige
 * en janvier ; les resultats, eux, tomberont cinq week-ends de suite. Un
 * analyseur qui lit le calendrier mais pas les scores ne sert a rien.
 *
 * ---------------------------------------------------------------------------
 * CE QUE CE SCRIPT FAIT
 * ---------------------------------------------------------------------------
 *
 * Il affiche deux cartes entieres de l'edition 2026, nettoyees de leurs
 * echappements, de la premiere nation a la fin de la carte. Rien de plus. On
 * verra a l'oeil ou vit le score, sous quel nom, et si la carte porte aussi la
 * journee et le stade.
 *
 * Et, pour comparer, une carte de 2027 — l'une est a venir, l'autre est jouee,
 * et la difference entre les deux est tout ce qu'il reste a comprendre.
 *
 * ---------------------------------------------------------------------------
 * USAGE
 * ---------------------------------------------------------------------------
 *
 *   node scripts/six-nations-sonde3.js
 *
 * Lecture seule, deux requetes.
 */

const axios = require('axios');

const BASE = 'https://www.sixnationsrugby.com';

/** Le JSON embarque dans la page est echappe ; on le rend lisible avant tout. */
const lisible = (s) =>
  String(s)
    .replace(/\\"/g, '"')
    .replace(/\\u0026/g, '&')
    .replace(/\\n/g, ' ')
    .replace(/\\/g, '')
    .replace(/\s+/g, ' ');

/**
 * Les cartes de rencontre, decoupees sur le conteneur d'equipes.
 *
 * On prend `fixturesResultsCard_teamContainer` comme borne plutot que le nom de
 * la carte elle-meme : c'est le premier element propre a une rencontre, et il
 * apparait deux fois par carte — une par camp. En decoupant dessus on obtient
 * des tranches qui contiennent surement un camp, son code et ce qui le suit.
 */
function cartes(clair, combien = 2) {
  const bornes = [];
  const re = /fixturesResultsCard_(card|match|fixture)[A-Za-z]*_/g;
  let m;
  while ((m = re.exec(clair))) bornes.push(m.index);

  // Si le nom de classe de la carte n'existe pas, on se rabat sur les codes
  // pays : deux codes encadrent toujours une rencontre.
  if (bornes.length < 2) {
    const r2 = /"(FRA|ENG|IRE|SCO|WAL|ITA)"/g;
    while ((m = r2.exec(clair))) bornes.push(m.index);
  }

  const sortie = [];
  for (let i = 0; i < bornes.length && sortie.length < combien; i += 2) {
    const debut = Math.max(0, bornes[i] - 300);
    const fin = bornes[i + 2] ?? bornes[i] + 2200;
    sortie.push(clair.slice(debut, Math.min(fin, debut + 2400)));
  }
  return sortie;
}

async function page(saison) {
  const url = `${BASE}/en/m6n/fixtures/${saison}`;
  const res = await axios.get(url, {
    timeout: 25000,
    headers: { 'User-Agent': 'top14-pronostics/1.0 (usage prive)', 'Accept-Language': 'en;q=0.9' },
    maxContentLength: 30 * 1024 * 1024,
  });
  return lisible(String(res.data));
}

(async () => {
  for (const [saison, quoi] of [['202600', 'JOUEE'], ['202700', 'A VENIR']]) {
    console.log('\n' + '='.repeat(74));
    console.log(`EDITION ${saison.slice(0, 4)} — ${quoi}`);
    console.log('='.repeat(74));

    let clair;
    try {
      clair = await page(saison);
    } catch (err) {
      console.log(`\n  ECHEC : ${err.message}`);
      continue;
    }

    /*
     * Avant les cartes, les mots qui pourraient porter un score. On les cherche
     * sur la page nettoyee, ce que la sonde precedente ne faisait pas pour
     * cette liste-la — et c'est ainsi qu'on avait manque les codes pays.
     */
    const mots = ['"score"', 'scoreHome', 'scoreAway', 'homeScore', 'awayScore',
                  'fullTime', '"FT"', 'winner', 'points', 'result', 'status'];
    console.log('\n  mots candidats au score :');
    console.log('    ' + mots.map((w) => {
      const n = (clair.match(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      return `${w} ${n}`;
    }).join('   '));

    const lot = cartes(clair, 2);
    console.log(`\n  ${lot.length} carte(s) extraite(s) :\n`);

    lot.forEach((c, i) => {
      console.log('  ' + '-'.repeat(70));
      console.log(`  CARTE ${i + 1}`);
      console.log('  ' + '-'.repeat(70));
      console.log('  ' + c.trim());
      console.log('');
    });

    await new Promise((r) => setTimeout(r, 800));
  }

  console.log(`

${'='.repeat(74)}
CE QU'IL FAUT Y LIRE
${'='.repeat(74)}

  Dans la carte de 2026, deux nombres pres des deux codes pays : ce sont les
  scores, et l'analyseur est a portee. On regardera au passage si la journee
  et le stade y figurent — ce serait un bonus, pas une necessite.

  Aucun nombre : les scores sont charges apres coup, et il faudra les saisir.
  Ce qui, pour dix rencontres sur cinq week-ends, reste deux minutes par
  samedi — et le calendrier, lui, serait quand meme collecte automatiquement.
`);
})().catch((e) => {
  console.error('\nEchec :', e.message);
  process.exit(1);
});
