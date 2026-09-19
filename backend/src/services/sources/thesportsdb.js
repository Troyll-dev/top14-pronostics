const axios = require('axios');

/**
 * TheSportsDB — source principale.
 *
 * C'est elle qui porte le calendrier complet, journee par journee, avec un
 * identifiant stable par rencontre (idEvent). C'est ce qui permet d'accrocher
 * un evenement a un match de la base une fois pour toutes.
 *
 * En revanche son champ d'etat est du texte libre alimente par des benevoles :
 * il reste regulierement bloque sur « 2H » plusieurs heures apres la fin d'un
 * match. On ne lui fait donc confiance que lorsqu'il annonce explicitement une
 * rencontre terminee.
 */

const API_KEY   = process.env.SPORTSDB_KEY || '123';
const LEAGUE_ID = 4430;
const BASE      = `https://www.thesportsdb.com/api/v1/json/${API_KEY}`;

const FINAL_STATUS = new Set(['FT', 'AET', 'AP', 'PEN', 'FT_PEN', 'MATCH FINISHED', 'FINISHED']);

/** strTimestamp est en UTC, sans suffixe de fuseau. */
function parseKickoff(ev) {
  const raw = ev.strTimestamp || (ev.dateEvent && ev.strTime ? `${ev.dateEvent}T${ev.strTime}` : null);
  if (!raw) return null;
  const iso = raw.includes('T') ? `${raw}Z`.replace('ZZ', 'Z') : `${raw.replace(' ', 'T')}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeEvent(ev) {
  const hs = parseInt(ev.intHomeScore, 10);
  const as = parseInt(ev.intAwayScore, 10);
  const status = (ev.strStatus || '').trim().toUpperCase();

  return {
    source: 'thesportsdb',
    externalId: String(ev.idEvent),
    home: ev.strHomeTeam,
    away: ev.strAwayTeam,
    homeScore: Number.isNaN(hs) ? null : hs,
    awayScore: Number.isNaN(as) ? null : as,
    // Etat vide = l'API ne se prononce pas ; l'orchestrateur tranchera a l'heure.
    final: status ? FINAL_STATUS.has(status) : null,
    rawStatus: status || null,
    kickoff: parseKickoff(ev),
  };
}

/** Evenements d'une journee. Renvoie [] et journalise en cas d'echec. */
async function fetchRound(round, season) {
  try {
    const { data } = await axios.get(
      `${BASE}/eventsround.php?id=${LEAGUE_ID}&r=${round}&s=${season}`,
      { timeout: 15000 }
    );
    return ((data && data.events) || []).map(normalizeEvent);
  } catch (err) {
    console.error(`[sync] thesportsdb J${round} : ${err.message}`);
    return null;   // null = source indisponible, a distinguer d'une journee vide
  }
}

module.exports = { fetchRound, FINAL_STATUS, parseKickoff };
