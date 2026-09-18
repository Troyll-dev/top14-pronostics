const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const { calculatePoints } = require('../controllers/match.controller');

const prisma = new PrismaClient();

const API_KEY   = process.env.SPORTSDB_KEY    || '123';        // 123 = cle publique gratuite
const SEASON    = process.env.SPORTSDB_SEASON || '2026-2027';
const LEAGUE_ID = 4430;                                        // French Top 14 sur TheSportsDB
const BASE      = `https://www.thesportsdb.com/api/v1/json/${API_KEY}`;

/**
 * Exceptions de correspondance d'equipes.
 * Cle   = nom renvoye par TheSportsDB (en minuscules)
 * Valeur = shortName de l'equipe dans TA base
 * A completer seulement si les logs signalent une equipe non reconnue.
 */
const OVERRIDES = {
  // 'racing 92': 'R92',
};

// --- Utilitaires de correspondance de noms ------------------------------------

function normalize(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // retire les accents
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');        // ne garde que lettres + chiffres
}

/** Longueur de la plus longue sous-chaine commune a a et b. */
function commonLength(a, b) {
  if (!a || !b) return 0;
  let best = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = i + best + 1; j <= a.length; j++) {
      if (b.includes(a.slice(i, j))) best = j - i;
      else break;
    }
  }
  return best;
}

/**
 * Retrouve l'equipe en base correspondant a un nom TheSportsDB.
 * Ex : "Stade Toulousain" -> Toulouse, "Union Bordeaux Begles" -> Bordeaux
 */
function resolveTeam(apiName, teams) {
  const override = OVERRIDES[(apiName || '').toLowerCase()];
  if (override) {
    const t = teams.find((x) => x.shortName === override);
    if (t) return t;
  }

  const n = normalize(apiName);
  if (!n) return null;

  // 1. Correspondance exacte sur name / shortName / city
  const exact = teams.find((x) =>
    [x.name, x.shortName, x.city].some((f) => f && normalize(f) === n)
  );
  if (exact) return exact;

  // 2. Correspondance partielle : plus longue sous-chaine commune (min 5 caracteres)
  let bestTeam = null;
  let bestScore = 4;
  for (const team of teams) {
    for (const field of [team.name, team.city, team.shortName]) {
      const score = commonLength(n, normalize(field));
      if (score > bestScore) {
        bestScore = score;
        bestTeam = team;
      }
    }
  }
  return bestTeam;
}

// --- Synchronisation ----------------------------------------------------------

/**
 * Recupere les resultats de la saison depuis TheSportsDB et met la base a jour.
 * @param {{ dryRun?: boolean }} options  dryRun = simule sans rien ecrire
 */
async function syncResults({ dryRun = false } = {}) {
  const url = `${BASE}/eventsseason.php?id=${LEAGUE_ID}&s=${SEASON}`;
  const { data } = await axios.get(url, { timeout: 15000 });
  const events = data && data.events ? data.events : [];

  if (!events.length) {
    return { ok: false, reason: `Aucun match renvoye par l'API pour la saison ${SEASON}`, updated: 0 };
  }

  const teams = await prisma.team.findMany();
  const report = { ok: true, dryRun, total: events.length, updated: 0, skipped: 0, unmatched: [], changes: [] };

  for (const ev of events) {
    // Match pas encore joue : aucun score renvoye
    const homeScore = parseInt(ev.intHomeScore, 10);
    const awayScore = parseInt(ev.intAwayScore, 10);
    if (Number.isNaN(homeScore) || Number.isNaN(awayScore)) {
      report.skipped++;
      continue;
    }

    // 1. Retrouver le match en base : d'abord par externalId (rapide et sur)
    let match = await prisma.match.findFirst({ where: { externalId: String(ev.idEvent) } });

    // 2. Sinon par la paire d'equipes (unique par saison en Top 14)
    if (!match) {
      const home = resolveTeam(ev.strHomeTeam, teams);
      const away = resolveTeam(ev.strAwayTeam, teams);

      if (!home || !away) {
        report.unmatched.push(`${ev.strHomeTeam} vs ${ev.strAwayTeam} (equipe non reconnue)`);
        continue;
      }

      match = await prisma.match.findFirst({
        where: { homeTeamId: home.id, awayTeamId: away.id, season: SEASON },
      });

      if (!match) {
        report.unmatched.push(`${ev.strHomeTeam} vs ${ev.strAwayTeam} (absent de la base)`);
        continue;
      }
    }

    // Deja a jour : on ne reecrit pas
    if (match.status === 'FINISHED' && match.homeScore === homeScore && match.awayScore === awayScore) {
      report.skipped++;
      continue;
    }

    const label = `J${match.round} ${ev.strHomeTeam} ${homeScore}-${awayScore} ${ev.strAwayTeam}`;
    report.changes.push(label);

    if (dryRun) {
      report.updated++;
      continue;
    }

    const updated = await prisma.match.update({
      where: { id: match.id },
      data: {
        homeScore,
        awayScore,
        status: 'FINISHED',
        externalId: match.externalId || String(ev.idEvent),
      },
    });

    // Recalcul des points avec EXACTEMENT la meme logique que la saisie manuelle
    await calculatePoints(updated);

    report.updated++;
    console.log(`[sync] ${label}`);
  }

  if (report.unmatched.length) {
    console.warn('[sync] non reconnus :', report.unmatched);
  }
  console.log(`[sync] ${dryRun ? '(simulation) ' : ''}${report.updated} mis a jour, ${report.skipped} ignores`);

  return report;
}

/**
 * Faut-il interroger l'API ?
 * Oui seulement s'il reste au moins un match passe non marque FINISHED.
 * Evite d'appeler TheSportsDB pour rien entre les journees.
 */
async function shouldSync() {
  const pending = await prisma.match.count({
    where: { kickoff: { lt: new Date() }, status: { not: 'FINISHED' } },
  });
  return pending > 0;
}

module.exports = { syncResults, shouldSync, resolveTeam };
