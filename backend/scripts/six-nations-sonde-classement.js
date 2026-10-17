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
  const pages = [
    // France–Angleterre, dernier match : 2026 s'y est joué, et il y a eu des
    // essais des deux côtés. Puis le premier match, et la page « match » sans
    // « /report », au cas où elle en dirait plus.
    `/en/m6n/fixtures/${SAISON}/france-v-england-14032026-2110/report`,
    `/en/m6n/fixtures/${SAISON}/france-v-ireland-05022026-2110/report`,
    `/en/m6n/fixtures/${SAISON}/france-v-ireland-05022026-2110`,
  ];
  for (const chemin of pages) {
    const p = await lire(chemin);
    console.log(`\n=== ${p.url} · statut ${p.statut} · ${p.taille} octets`);
    if (p.statut !== 200) continue;
    const comptes = {};
    for (const m of p.t.matchAll(/tries|"try"|tryScorers|scorers|conversions|penalt|drop|bonus|"T"|scoring|timeline|events/gi)) {
      const k = m[0].toLowerCase();
      comptes[k] = (comptes[k] || 0) + 1;
    }
    console.log('  mots-clés :', JSON.stringify(comptes));
    for (const re of [/tries/, /tryScor|scorers/, /"try"/, /conversion/, /timeline|events/]) {
      const x = extrait(p.t, re, 450);
      if (x) console.log(`  --- autour de ${re} :\n  ${x}\n`);
    }
  }
  process.exit(0);
})().catch((e) => {
  console.error('Échec :', e.message);
  process.exit(1);
});
