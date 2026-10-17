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
  for (const saison of ['202600', '202700']) {
    const p = await lire(`/en/m6n/fixtures/${saison}/table`);
    console.log(`\n=== ${p.url} · statut ${p.statut} · ${p.taille} octets`);
    if (p.statut !== 200) continue;

    // Les champs du tableau, et combien de fois ils apparaissent : six fois
    // chacun si les six lignes sont dans la page.
    const champs = ['triesFor', 'triesAgainst', 'bonusPoint', 'bonusPoints', 'pointsFor', 'played', 'position', 'points'];
    console.log('  comptes :', champs.map((c) => `${c}×${(p.t.match(new RegExp(`"${c}":`, 'g')) || []).length}`).join('  '));

    // Une ligne : le premier « triesFor » suivi d'un nombre, avec son contexte.
    const re = /"triesFor":\s*"?\d/;
    const x = extrait(p.t, re, 700);
    console.log(x ? `  --- une ligne du tableau :\n  ${x}` : '  aucun « triesFor » numérique dans la page');

    // Les adresses d'API, s'il y en a : le tableau peut venir de là.
    const api = [...new Set([...p.t.matchAll(/https?:\/\/[a-z0-9.-]*(?:api|stats|feed|data)[a-z0-9.-]*\/[^"'\s<>]{0,120}/gi)].map((m) => m[0]))];
    console.log(`  adresses d'API : ${api.length ? '\n    ' + api.slice(0, 15).join('\n    ') : 'aucune'}`);
  }
  process.exit(0);
})().catch((e) => {
  console.error('Échec :', e.message);
  process.exit(1);
});
