/**
 * Le site officiel du Tournoi est-il lisible en une requete ?
 *
 * ---------------------------------------------------------------------------
 * POURQUOI CETTE SOURCE
 * ---------------------------------------------------------------------------
 *
 * La FFR donne les cinq rencontres du XV de France, avec leurs compositions, et
 * rien d'autre : son modele de donnees ne connait que « la France » et « son
 * adversaire ». Angleterre–Ecosse n'y existe pas.
 *
 * Six Nations Rugby organise le Tournoi. C'est donc, pour cette competition, ce
 * que la LNR est au Top 14 : la source d'autorite. Et son adressage est
 * parfaitement regulier — l'annee suivie de deux zeros :
 *
 *     /en/m6n/fixtures/202700      l'edition 2027
 *     /en/m6n/fixtures/202600      l'edition 2026
 *
 * La page de 2027 existe deja et affiche des rencontres. Mieux : le site est
 * rendu par le serveur, comme celui de la LNR et contrairement a celui de la
 * FFR. Une requete devrait donc suffire.
 *
 * ---------------------------------------------------------------------------
 * CE QUE CE SCRIPT VERIFIE, ET CE QU'IL NE FAIT PAS
 * ---------------------------------------------------------------------------
 *
 * Il ne construit pas d'analyseur. Il repond a trois questions, dans l'ordre ou
 * elles font echouer un projet :
 *
 *   1. La donnee est-elle dans le HTML livre ? Un site rendu par le serveur
 *      repond oui ; une application construite dans le navigateur repond non,
 *      et il faut alors chercher ailleurs.
 *
 *   2. Combien de rencontres y trouve-t-on ? Quinze est la reponse attendue.
 *      Trois signifierait qu'une seule journee est publiee ; zero, que la
 *      structure n'est pas celle qu'on croit.
 *
 *   3. Les scores des editions passees y sont-ils ? C'est ce qui prouve que la
 *      meme page servira a relever les resultats, et pas seulement a annoncer
 *      le calendrier. On interroge donc 2027 et 2026 : l'une a venir, l'autre
 *      jouee.
 *
 * Les pages modernes embarquent leur donnee sous forme de JSON dans le HTML. On
 * ne cherche donc pas des balises mais **des motifs de donnee** — codes pays a
 * trois lettres, dates ISO, mots-clefs de score. C'est plus robuste a une
 * refonte graphique, et ca suffit largement pour decider si la source tient.
 *
 * ---------------------------------------------------------------------------
 * USAGE
 * ---------------------------------------------------------------------------
 *
 *   node scripts/six-nations-sonde.js
 *   node scripts/six-nations-sonde.js 202600
 *   node scripts/six-nations-sonde.js 202700 --brut
 *
 * Lecture seule, deux requetes, aucune ecriture.
 */

const axios = require('axios');

const BASE = 'https://www.sixnationsrugby.com';
const BRUT = process.argv.includes('--brut');
const SAISONS = process.argv.slice(2).filter((a) => /^\d{6}$/.test(a));
const CIBLES = SAISONS.length ? SAISONS : ['202700', '202600'];

/** Les six nations, telles que le site les code. */
const PAYS = ['FRA', 'ENG', 'IRE', 'SCO', 'WAL', 'ITA'];

const dors = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  for (const saison of CIBLES) {
    const url = `${BASE}/en/m6n/fixtures/${saison}`;
    console.log('\n' + '='.repeat(74));
    console.log(url);
    console.log('='.repeat(74));

    let html;
    try {
      const res = await axios.get(url, {
        timeout: 25000,
        headers: {
          'User-Agent': 'top14-pronostics/1.0 (usage prive)',
          'Accept-Language': 'fr,en;q=0.8',
        },
        maxContentLength: 30 * 1024 * 1024,
      });
      html = String(res.data);
      console.log(`\n  statut ${res.status}  ·  ${html.length.toLocaleString('fr-FR')} caracteres\n`);
    } catch (err) {
      console.log(`\n  ECHEC : ${err.message}\n`);
      continue;
    }

    /* -------------------------------------------------------------------- */
    /* 1. La donnee est-elle la                                             */
    /* -------------------------------------------------------------------- */

    const compte = (re) => (html.match(re) || []).length;

    // Un code pays entre guillemets : la marque d'une donnee structuree, et non
    // d'un texte d'habillage.
    const codes = {};
    for (const p of PAYS) codes[p] = compte(new RegExp(`"${p}"`, 'g'));
    const totalCodes = Object.values(codes).reduce((a, b) => a + b, 0);

    const dates = compte(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/g);
    const venues = compte(/venue/gi);
    const scores = compte(/"score"|homeScore|awayScore|"points"/gi);

    console.log('  ce que contient le HTML livre :');
    console.log(`    codes pays entre guillemets : ${totalCodes}   (${PAYS.map((p) => `${p} ${codes[p]}`).join(', ')})`);
    console.log(`    dates ISO                   : ${dates}`);
    console.log(`    mentions « venue »          : ${venues}`);
    console.log(`    mentions de score           : ${scores}`);

    if (!totalCodes || !dates) {
      console.log(`
  Les donnees ne sont PAS dans le HTML livre : la page se construit dans le
  navigateur, comme celle de la FFR. Cette source ne se lit pas en une requete,
  et il faudra en chercher une autre — ou saisir les quinze lignes.
`);
      continue;
    }

    /* -------------------------------------------------------------------- */
    /* 2. Combien de rencontres                                             */
    /* -------------------------------------------------------------------- */

    /*
     * On reconstitue les affiches en reperant deux codes pays separes par peu
     * de caracteres. C'est volontairement grossier : il ne s'agit pas d'ecrire
     * l'analyseur definitif mais de compter, et un comptage approche suffit a
     * distinguer quinze rencontres de zero.
     */
    const affiches = [];
    const re = new RegExp(`"(${PAYS.join('|')})"[\\s\\S]{0,400}?"(${PAYS.join('|')})"`, 'g');
    let m;
    while ((m = re.exec(html))) {
      if (m[1] !== m[2]) affiches.push(`${m[1]}–${m[2]}`);
    }
    const uniques = [...new Set(affiches)];

    console.log(`\n  affiches reperees : ${uniques.length} distinctes`);
    console.log(`    ${uniques.slice(0, 20).join('  ')}`);

    /*
     * Une edition du Tournoi compte quinze rencontres : chacune des six nations
     * en joue cinq. Moins, et la page n'en publie qu'une partie ; plus, et on
     * compte autre chose que des affiches.
     */
    if (uniques.length >= 15) {
      console.log('\n  Quinze affiches ou plus : la page porte bien tout le calendrier.');
    } else if (uniques.length) {
      console.log(`\n  Seulement ${uniques.length} affiches — la page n'en publie peut-etre`);
      console.log('  qu'+"'"+'une partie, ou le reperage est trop grossier. A regarder de pres.');
    }

    /* -------------------------------------------------------------------- */
    /* 3. Les dates, et les scores pour une edition jouee                    */
    /* -------------------------------------------------------------------- */

    const toutesDates = [...new Set(html.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/g) || [])]
      .filter((d) => d.startsWith(saison.slice(0, 4)) || d.startsWith(String(Number(saison.slice(0, 4)))))
      .sort();

    if (toutesDates.length) {
      console.log(`\n  dates trouvees pour ${saison.slice(0, 4)} : ${toutesDates.length}`);
      console.log(`    de ${toutesDates[0]} a ${toutesDates[toutesDates.length - 1]}`);
      console.log(`    ${toutesDates.slice(0, 8).join('  ')}`);
    }

    if (BRUT) {
      // Un extrait centre sur la premiere affiche : de quoi voir la forme
      // reelle de la donnee avant d'ecrire quoi que ce soit.
      const i = html.search(new RegExp(`"(${PAYS.join('|')})"`));
      if (i > 0) {
        console.log('\n  extrait autour de la premiere affiche :');
        console.log('    ' + html.slice(Math.max(0, i - 400), i + 900).replace(/\s+/g, ' '));
      }
    }

    await dors(800);
  }

  console.log(`

${'='.repeat(74)}
CE QU'IL FAUT Y LIRE
${'='.repeat(74)}

  2027 avec quinze affiches et quinze dates : le calendrier est deja publie et
  se lit en une requete. On tient la source des dix rencontres qui manquent —
  et meme des quinze.

  2026 avec des scores : la meme page servira a relever les resultats pendant
  le Tournoi, ce qui est la seule chose reellement mouvante.

  Rien dans le HTML : la page se construit dans le navigateur, et il faudra
  choisir une autre source, ou saisir quinze lignes a la main. Ce qui, pour
  quinze lignes connues depuis mars, resterait une option parfaitement sobre.
`);
})().catch((e) => {
  console.error('\nEchec :', e.message);
  process.exit(1);
});
