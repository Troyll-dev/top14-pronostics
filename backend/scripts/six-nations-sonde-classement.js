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

/** Les liens internes d'une page, dédoublonnés. */
function liens(t) {
  const tous = [...t.matchAll(/"href":"([^"]+)"|href="([^"]+)"/g)].map((m) => m[1] || m[2]);
  return [...new Set(tous.filter((h) => h.startsWith('/') || h.includes('sixnationsrugby.com')))];
}

function extrait(texte, re, largeur = 300) {
  const m = new RegExp(re.source, 'i').exec(texte);
  if (!m) return null;
  return texte.slice(Math.max(0, m.index - largeur), m.index + largeur);
}

(async () => {
  const pages = [await lire('/en/m6n'), await lire(`/en/m6n/fixtures/${SAISON}`)];
  const tous = new Set();
  for (const p of pages) {
    console.log(`\n=== ${p.url} · statut ${p.statut} · ${p.taille} octets`);
    const l = liens(p.t);
    l.forEach((x) => tous.add(x));
    console.log(`  ${l.length} liens internes. Ceux du Tournoi masculin :`);
    console.log('  ' + l.filter((x) => x.includes('/m6n')).slice(0, 80).join('\n  '));
  }

  // Les liens qui ressemblent à un classement, ouverts un par un.
  const classements = [...tous].filter((x) => /stand|table|tabl|rank|ladder/i.test(x)).slice(0, 6);
  console.log(`\n### Liens de classement trouvés : ${classements.length ? classements.join('  ') : 'aucun'}`);
  for (const c of classements) {
    const p = await lire(c);
    console.log(`\n=== ${p.url} · statut ${p.statut} · ${p.taille} octets`);
    for (const re of [/tries/, /bonus/, /"FRA"|France/, /played|"P"/]) {
      const x = extrait(p.t, re);
      if (x) console.log(`  --- autour de ${re} :\n  ${x}\n`);
    }
  }

  // Une feuille de match, pour savoir si les essais s'y lisent.
  const feuilles = [...tous].filter((x) => /match|centre|report/i.test(x) && /m6n/.test(x)).slice(0, 3);
  console.log(`\n### Feuilles de match candidates : ${feuilles.join('  ') || 'aucune'}`);
  if (feuilles[0]) {
    const p = await lire(feuilles[0]);
    console.log(`\n=== ${p.url} · statut ${p.statut} · ${p.taille} octets`);
    for (const re of [/tries/, /"try"|Try/, /conversion/]) {
      const x = extrait(p.t, re);
      if (x) console.log(`  --- autour de ${re} :\n  ${x}\n`);
    }
  }
  process.exit(0);
})().catch((e) => {
  console.error('Échec :', e.message);
  process.exit(1);
});
