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
 * Sixième passe : les buteurs se lisent, mais sur France–Irlande 2026 ils
 * ne redonnent pas le score (34 au lieu de 36 : il manque une transformation,
 * ou un essai de pénalité mal reconnu). Cette septième passe affiche, pour ce
 * match, la liste brute des buteurs et la chronologie (`timeline`), qui porte
 * le score après chaque action — de quoi voir ce qui manque.
 *
 * Elle n'écrit rien.
 *
 *   node scripts/six-nations-sonde-classement.js
 */

const axios = require('axios');
const { lisible, BASE } = require('../src/services/sources/six-nations');

function objetA(texte, debut) {
  let prof = 0, chaine = false;
  for (let i = debut; i < texte.length; i++) {
    const c = texte[i];
    if (chaine) { if (c === '"') chaine = false; continue; }
    if (c === '"') chaine = true;
    else if (c === '{') prof++;
    else if (c === '}') { prof--; if (prof === 0) { try { return JSON.parse(texte.slice(debut, i + 1)); } catch (e) { return { erreur: e.message, brut: texte.slice(debut, Math.min(i + 1, debut + 400)) }; } } }
  }
  return null;
}

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
  const p = await lire(`/en/m6n/fixtures/${SAISON}/france-v-ireland-05022026-2110/report`);
  console.log(`\n=== ${p.url} · statut ${p.statut} · ${p.taille} octets`);
  const re = /"componentProps":\{"(?:home|away)":\{"score":/g;
  let m, n = 0;
  while ((m = re.exec(p.t))) {
    n++;
    const obj = objetA(p.t, p.t.indexOf('{', m.index + 17));
    if (!obj || obj.erreur) { console.log(`  bloc ${n} illisible :`, obj && obj.erreur, obj && obj.brut); continue; }
    for (const cote of ['home', 'away']) {
      const c = obj[cote];
      if (!c) continue;
      console.log(`\n  bloc ${n} · ${cote} · score ${c.score} (mi-temps ${c.scoreHt})`);
      for (const b of c.scorers || []) {
        console.log(`    ${String(b.scoreType).padEnd(14)} id ${String(b.playerId).padEnd(7)} ${String(b.playerName || '—').padEnd(26)} ${(b.scoreTimes || []).map((t) => t.gameMinutes).join(', ')}`);
      }
      if (Array.isArray(c.timeline)) {
        console.log(`  chronologie (${c.timeline.length}) :`);
        for (const e of c.timeline) console.log(`    ${String(e.gameMinutes).padEnd(6)} ${String(e.eventType).padEnd(16)} ${e.homeScore}-${e.awayScore}  ${e.playerName || ''}`);
      }
    }
    if (Array.isArray(obj.timeline)) {
      console.log(`\n  chronologie commune (${obj.timeline.length}) :`);
      for (const e of obj.timeline) console.log(`    ${String(e.gameMinutes).padEnd(6)} ${String(e.eventType).padEnd(16)} ${e.homeScore}-${e.awayScore}  ${e.playerName || ''}`);
    }
    console.log('\n  clés du bloc :', Object.keys(obj).join(', '), '| home :', Object.keys(obj.home || {}).join(', '));
  }
  console.log(`\n  ${n} bloc(s) trouvé(s)`);
  process.exit(0);
})().catch((e) => {
  console.error('Échec :', e.message);
  process.exit(1);
});
