/**
 * Sonde : où le site du Tournoi publie-t-il son classement ?
 *
 * Le classement du Tournoi compte des bonus — un point pour quatre essais
 * marqués, un point pour une défaite de sept points ou moins, trois pour un
 * Grand Chelem. Les essais ne sont pas dans ce que l'on relève aujourd'hui :
 * le classement ne peut donc pas être recalculé à partir des scores seuls, il
 * faut le lire là où le site le publie. Cette sonde cherche où.
 *
 * Première passe : les adresses devinées (`/standings`, `/table`) sont toutes
 * en 404. Celle-ci ne devine plus : elle relève les liens du site lui-même —
 * le menu de l'accueil du Tournoi et la page des matchs — puis ouvre ceux qui
 * ressemblent à un classement, et un lien de feuille de match pour voir si les
 * essais y figurent.
 *
 * Deuxième passe : le site ne publie aucun lien de classement. Il publie en
 * revanche, pour chaque match joué, une page « report ». Si les essais y sont,
 * le classement se recalcule — bonus compris. Cette troisième passe ouvre
 * donc deux de ces pages et cherche les essais.
 *
 * Troisième passe : les pages « report » portent un onglet « Live table » et
 * un bloc « buteurs » (T, C, P, D). Il y a donc un classement et des essais
 * quelque part dans les données de la page. Cette quatrième passe ne cherche
 * plus des mots dans le texte : elle relève les noms de champs des données
 * embarquées, pour voir comment le classement et les essais sont rangés.
 *
 * Elle n'écrit rien, et interroge l'édition 2026, qui est complète.
 *
 *   node scripts/six-nations-sonde-classement.js
 */

const axios = require('axios');
const { lisible, BASE } = require('../src/services/sources/six-nations');

const SAISON = '202600';
const ENTETES = { 'User-Agent': 'top14-pronostics/1.0 (usage prive)', 'Accept-Language': 'en;q=0.9' };

async function lire(chemin) {
  const url = chemin.startsWith('http') ? chemin : BASE + chemin;
  try {
    const res = await axios.get(url, { timeout: 20000, maxRedirects: 5, validateStatus: () => true, headers: ENTETES });
    const brut = String(res.data || '');
    return { url, statut: res.status, taille: brut.length, t: lisible(brut) };
  } catch (e) {
    return { url, statut: 'ÉCHEC ' + e.message, taille: 0, t: '' };
  }
}

function extrait(texte, re, largeur = 300) {
  const m = new RegExp(re.source, 'i').exec(texte);
  if (!m) return null;
  return texte.slice(Math.max(0, m.index - largeur), m.index + largeur);
}

(async () => {
  const chemin = `/en/m6n/fixtures/${SAISON}/france-v-england-14032026-2110/report`;
  const p = await lire(chemin);
  console.log(`\n=== ${p.url} · statut ${p.statut} · ${p.taille} octets`);
  if (p.statut !== 200) process.exit(0);

  // Les noms de champs JSON qui pourraient porter un classement ou des essais.
  const INTERESSANT = /tr(y|ies)|bonus|point|play|won|lost|draw|position|rank|table|standing|score|grand|slam|team(Id|Code|Name)|abbr/i;
  const cles = {};
  for (const m of p.t.matchAll(/"([A-Za-z_][A-Za-z0-9_]{1,40})":/g)) {
    if (INTERESSANT.test(m[1])) cles[m[1]] = (cles[m[1]] || 0) + 1;
  }
  const tri = Object.entries(cles).sort((a, b) => b[1] - a[1]);
  console.log(`\n  ${tri.length} noms de champs retenus :`);
  console.log('  ' + tri.map(([k, n]) => `${k}×${n}`).join('  '));

  // Le contexte des plus parlants, deux occurrences chacun.
  const VOIR = /^(tries|triesFor|triesAgainst|tryBonus|losingBonus|bonusPoints|bonus|points|pointsFor|position|played|won|standings|table|liveTable|type)$/i;
  for (const [k] of tri.filter(([k]) => VOIR.test(k)).slice(0, 10)) {
    const re = new RegExp(`"${k}":`, 'g');
    let n = 0, m;
    while ((m = re.exec(p.t)) && n < 2) {
      console.log(`\n  --- "${k}" (${n + 1}) :\n  ${p.t.slice(Math.max(0, m.index - 250), m.index + 350)}`);
      n++;
    }
  }

  // Et le texte qui suit les libellés des buteurs.
  for (const re of [/"Try":"T"/, /Show Scorers/, /liveTable/]) {
    const x = extrait(p.t, re, 50);
    if (x) console.log(`\n  --- ${re} présent`);
  }
  process.exit(0);
})().catch((e) => {
  console.error('Échec :', e.message);
  process.exit(1);
});
