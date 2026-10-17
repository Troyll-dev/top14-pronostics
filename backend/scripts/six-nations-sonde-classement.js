/**
 * Sonde : où le site du Tournoi publie-t-il son classement ?
 *
 * Le classement du Tournoi compte des bonus — un point pour quatre essais
 * marqués, un point pour une défaite de sept points ou moins, trois pour un
 * Grand Chelem. Les essais ne sont pas dans ce que l'on relève aujourd'hui :
 * le classement ne peut donc pas être recalculé à partir des scores seuls, il
 * faut le lire là où le site le publie. Cette sonde cherche où.
 *
 * Elle n'écrit rien. Elle interroge l'édition 2026, qui est complète, pour
 * voir des chiffres réels.
 *
 *   node scripts/six-nations-sonde-classement.js
 */

const axios = require('axios');
const { lisible, BASE } = require('../src/services/sources/six-nations');

const SAISON = '202600';
const CANDIDATES = [
  `/en/m6n/standings/${SAISON}`,
  '/en/m6n/standings',
  `/en/m6n/table/${SAISON}`,
  '/en/m6n/table',
  `/en/m6n/tables/${SAISON}`,
  `/en/m6n/fixtures/${SAISON}`,
];

const MOTS = /tries|try_bonus|trybonus|bonus|losing|standing|played|"won"|"drawn"|points_?for|pointsFor|grand.?slam/gi;

function extrait(texte, re, largeur = 260) {
  const m = re.exec(texte);
  if (!m) return null;
  const debut = Math.max(0, m.index - largeur);
  return texte.slice(debut, m.index + largeur);
}

(async () => {
  for (const chemin of CANDIDATES) {
    const url = BASE + chemin;
    console.log(`\n=== ${url}`);
    let res;
    try {
      res = await axios.get(url, {
        timeout: 20000,
        maxRedirects: 5,
        validateStatus: () => true,
        headers: { 'User-Agent': 'top14-pronostics/1.0 (usage prive)', 'Accept-Language': 'en;q=0.9' },
      });
    } catch (e) {
      console.log(`  ÉCHEC : ${e.message}`);
      continue;
    }
    const brut = String(res.data || '');
    const t = lisible(brut);
    console.log(`  statut ${res.status} · ${brut.length} octets · arrivée ${res.request?.res?.responseUrl || url}`);
    if (res.status !== 200) continue;

    // Combien de fois chaque mot-clé apparaît : dit d'un coup d'œil si la page
    // porte un classement.
    const comptes = {};
    for (const m of t.matchAll(MOTS)) {
      const k = m[0].toLowerCase();
      comptes[k] = (comptes[k] || 0) + 1;
    }
    console.log('  mots-clés :', JSON.stringify(comptes));

    // Les liens vers une page de classement, s'il y en a.
    const liens = [...new Set([...t.matchAll(/href="([^"]*(?:standing|table)[^"]*)"/gi)].map((m) => m[1]))];
    if (liens.length) console.log('  liens :', liens.slice(0, 8).join('  '));

    for (const re of [/tries/i, /bonus/i, /standing/i, /"FRA"/]) {
      const x = extrait(t, new RegExp(re.source, 'i'));
      if (x) console.log(`  --- autour de ${re} :\n  ${x}\n`);
    }
  }
  process.exit(0);
})().catch((e) => {
  console.error('Échec :', e.message);
  process.exit(1);
});
