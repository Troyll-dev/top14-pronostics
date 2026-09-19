const axios = require('axios');

/**
 * ESPN — second avis.
 *
 * Pas de cle d'API, et surtout un etat exploitable : status.type.completed est
 * un booleen, status.type.state vaut pre / in / post. La ou TheSportsDB laisse
 * un champ texte se figer, ESPN dit franchement si la rencontre est finie.
 *
 * Sa limite : le tableau de bord ne renvoie que les rencontres du moment, pas
 * le calendrier complet, et une rencontre tardive peut n'y apparaitre qu'avec
 * du retard. C'est un complement, pas un remplacant — d'ou l'absence de notion
 * de journee ici : on prend ce qu'il y a et l'orchestrateur rapproche par les
 * noms d'equipes.
 */

const LEAGUE_ID = 270559;   // French Top 14
const URL = `https://site.api.espn.com/apis/site/v2/sports/rugby/${LEAGUE_ID}/scoreboard`;

function normalizeEvent(ev) {
  const comp = (ev.competitions && ev.competitions[0]) || null;
  if (!comp) return null;

  const sides = comp.competitors || [];
  const home = sides.find((c) => c.homeAway === 'home');
  const away = sides.find((c) => c.homeAway === 'away');
  if (!home || !away) return null;

  const type = (comp.status && comp.status.type) || (ev.status && ev.status.type) || {};
  const hs = parseInt(home.score, 10);
  const as = parseInt(away.score, 10);

  const name = (t) =>
    (t.team && (t.team.displayName || t.team.name || t.team.location)) || null;

  const kickoff = ev.date ? new Date(ev.date) : null;

  return {
    source: 'espn',
    externalId: ev.id ? `espn:${ev.id}` : null,
    home: name(home),
    away: name(away),
    homeScore: Number.isNaN(hs) ? null : hs,
    awayScore: Number.isNaN(as) ? null : as,
    final: type.completed === true || type.name === 'STATUS_FINAL',
    rawStatus: type.name || type.state || null,
    kickoff: kickoff && !Number.isNaN(kickoff.getTime()) ? kickoff : null,
  };
}

/** Rencontres actuellement publiees. null si la source est injoignable. */
async function fetchCurrent() {
  try {
    const { data } = await axios.get(URL, { timeout: 15000 });
    return ((data && data.events) || []).map(normalizeEvent).filter(Boolean);
  } catch (err) {
    console.error(`[sync] espn : ${err.message}`);
    return null;
  }
}

module.exports = { fetchCurrent };
