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
 * Quatrième passe : le bloc « Live table » mène à « View Full Table »,
 * `/en/m6n/fixtures/202600/table`. Ses colonnes sont celles qu'il nous faut —
 * Pos, P, W, D, L, PF, PA, DIFF, TF, TA, BP, Pts. Mais dans la page « report »
 * le tableau est vide : il est chargé ensuite par le navigateur. Cette
 * cinquième passe ouvre la page du tableau elle-même, pour 2026 (terminé) et
 * 2027 (pas commencé), et relève aussi les adresses d'API qu'elle contient.
 *
 * Cinquième passe : la page du tableau est vide elle aussi — le navigateur
 * le charge depuis une API qui n'apparaît pas dans la page. En revanche, les
 * buteurs sont bien écrits dans la page « report » (`scoreType`, `scoreTimes`,
 * quatorze fois). Avec les essais de chaque match, le classement se recalcule
 * entièrement selon le règlement du Tournoi. Cette sixième passe montre
 * comment les buteurs sont rangés, et vérifie qu'ils redonnent le score.
 *
 * Elle n'écrit rien.
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
  const p = await lire(`/en/m6n/fixtures/${SAISON}/france-v-england-14032026-2110/report`);
  console.log(`\n=== ${p.url} · statut ${p.statut} · ${p.taille} octets`);
  if (p.statut !== 200) process.exit(0);

  // Le premier buteur, avec ce qui le précède : on y verra à quel camp il
  // appartient et comment la liste est rangée.
  const re = /"scoreType":/g;
  const positions = [];
  let m;
  while ((m = re.exec(p.t))) positions.push(m.index);
  console.log(`  ${positions.length} « scoreType »`);
  if (positions[0] !== undefined) {
    console.log(`\n  --- avant et après le premier :\n  ${p.t.slice(Math.max(0, positions[0] - 900), positions[0] + 500)}`);
  }
  if (positions.length > 1) {
    const last = positions[positions.length - 1];
    console.log(`\n  --- autour du dernier :\n  ${p.t.slice(Math.max(0, last - 300), last + 400)}`);
  }

  // Chaque entrée en une ligne : type et minutes.
  console.log('\n  --- toutes les entrées :');
  for (const pos of positions) {
    const bout = p.t.slice(Math.max(0, pos - 160), pos + 200);
    const nom = /"playerName":"([^"]*)"/.exec(bout)?.[1] || /"(?:lastName|name)":"([^"]*)"/.exec(bout)?.[1] || '?';
    const type = /"scoreType":"([^"]*)"/.exec(bout)?.[1] || '?';
    const fois = /"scoreTimes":\[([^\]]*)\]/.exec(bout)?.[1] || '?';
    console.log(`    ${type.padEnd(12)} ${nom.padEnd(28)} ${fois}`);
  }
  process.exit(0);
})().catch((e) => {
  console.error('Échec :', e.message);
  process.exit(1);
});
