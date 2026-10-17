/**
 * Sonde : où lire les essais du Tournoi de façon fiable ?
 *
 * Les feuilles de match du site officiel sont incomplètes sur certains
 * matchs : sur Irlande–Écosse 2026, les buteurs relevés font 33 points pour
 * un score de 43. Dix points manquent — deux essais, ou des pénalités et des
 * transformations : impossible de savoir. Le bonus offensif dépend des essais,
 * on ne peut donc pas se fier à cette source seule.
 *
 * ESPN, que l'appli lit déjà pour les résultats du Top 14, couvre aussi le
 * Tournoi (ligue 180659) et publie des statistiques d'équipe par match. Cette
 * sonde vérifie qu'on y trouve les essais, sur l'édition 2026, en particulier
 * pour France–Irlande et Irlande–Écosse.
 *
 * Elle n'écrit rien.
 *
 *   node scripts/six-nations-sonde-classement.js
 */

const axios = require('axios');

const API = 'https://site.api.espn.com/apis/site/v2/sports/rugby/180659';

const get = async (url) => {
  try {
    const r = await axios.get(url, { timeout: 20000, validateStatus: () => true });
    return { statut: r.status, data: r.data };
  } catch (e) {
    return { statut: 'ÉCHEC ' + e.message, data: null };
  }
};

(async () => {
  const sb = await get(`${API}/scoreboard?dates=20260201-20260320&limit=50`);
  console.log(`\n=== scoreboard 2026 · statut ${sb.statut}`);
  const events = sb.data?.events || [];
  console.log(`  ${events.length} rencontres`);
  const lignes = events.map((e) => {
    const c = e.competitions?.[0]?.competitors || [];
    const h = c.find((x) => x.homeAway === 'home');
    const a = c.find((x) => x.homeAway === 'away');
    return { id: e.id, date: e.date, h: h?.team?.abbreviation, a: a?.team?.abbreviation, hs: h?.score, as: a?.score, hn: h?.team?.displayName, an: a?.team?.displayName };
  });
  for (const l of lignes) console.log(`    ${l.id}  ${l.date?.slice(0, 10)}  ${l.hn} ${l.hs}–${l.as} ${l.an}`);

  // Les deux matchs qui posent problème, et un troisième pour comparer.
  const cibles = lignes.filter((l) =>
    (/france/i.test(l.hn) && /ireland/i.test(l.an)) ||
    (/ireland/i.test(l.hn) && /scotland/i.test(l.an)) ||
    (/france/i.test(l.hn) && /england/i.test(l.an)));

  for (const l of cibles) {
    const s = await get(`${API}/summary?event=${l.id}`);
    console.log(`\n=== summary ${l.id} · ${l.hn} ${l.hs}–${l.as} ${l.an} · statut ${s.statut}`);
    if (!s.data) continue;
    console.log('  clés :', Object.keys(s.data).join(', '));
    for (const t of s.data.boxscore?.teams || []) {
      const stats = (t.statistics || []).map((x) => `${x.name || x.label}=${x.displayValue ?? x.value}`);
      console.log(`  ${t.team?.displayName} : ${stats.join('  ')}`);
    }
    // Les essais peuvent aussi être dans les actions de jeu.
    const plays = s.data.scoringPlays || s.data.plays || [];
    if (plays.length) {
      const types = {};
      for (const p of plays) {
        const k = `${p.team?.abbreviation || p.team?.id || '?'} ${p.type?.text || p.scoringType?.displayName || p.text?.slice(0, 20)}`;
        types[k] = (types[k] || 0) + 1;
      }
      console.log('  actions de score :', JSON.stringify(types));
    }
    const brut = JSON.stringify(s.data);
    const i = brut.search(/"tries"|"Tries"|try/i);
    if (i >= 0) console.log(`  --- premier « try » :\n  ${brut.slice(Math.max(0, i - 200), i + 300)}`);
  }
  process.exit(0);
})().catch((e) => {
  console.error('Échec :', e.message);
  process.exit(1);
});
