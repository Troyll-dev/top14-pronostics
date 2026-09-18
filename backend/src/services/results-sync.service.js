const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const { calculatePoints } = require('../controllers/match.controller');

const prisma = new PrismaClient();

const API_KEY   = process.env.SPORTSDB_KEY    || '123';        // 123 = cle publique gratuite
const SEASON    = process.env.SPORTSDB_SEASON || '2026-2027';
const LEAGUE_ID = 4430;                                        // French Top 14 sur TheSportsDB
const BASE      = `https://www.thesportsdb.com/api/v1/json/${API_KEY}`;
const MAX_ROUNDS = 4;                                          // journees interrogees au maximum par passage

/**
 * Exceptions de correspondance d'equipes.
 * Cle    = nom renvoye par TheSportsDB (en minuscules)
 * Valeur = name, shortName OU city de l'equipe dans TA base
 * "Section Paloise" ne partage aucune racine avec "Pau", d'ou l'exception.
 * A completer si les logs signalent encore une equipe non reconnue.
 */
const OVERRIDES = {
  'section paloise': 'Pau',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Correspondance de noms ---------------------------------------------------

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
 * Ex : "Lyon OU" -> Lyon, "Stade Toulousain" -> Toulouse
 */
function resolveTeam(apiName, teams) {
  const override = OVERRIDES[(apiName || '').toLowerCase()];
  if (override) {
    const o = normalize(override);
    const t = teams.find((x) => [x.name, x.shortName, x.city].some((f) => f && normalize(f) === o));
    if (t) return t;
  }

  const n = normalize(apiName);
  if (!n) return null;

  // 1. Correspondance exacte sur name / shortName / city
  const exact = teams.find((x) =>
    [x.name, x.shortName, x.city].some((f) => f && normalize(f) === n)
  );
  if (exact) return exact;

  // Les passes approximatives ignorent shortName : une abreviation de 2-4 lettres
  // produit des faux positifs ("LOU" se retrouve dans "Stade Toulousain").

  // 2. Inclusion complete d'un champ dans l'autre : "lyon" est contenu dans "lyonou".
  //    On garde le champ le plus long ("Stade Francais" l'emporte sur "Paris").
  let inclTeam = null;
  let inclLen = 3;                       // au moins 4 caracteres
  for (const team of teams) {
    for (const field of [team.name, team.city]) {
      const f = normalize(field);
      if (!f || f.length <= inclLen) continue;
      if (n.includes(f) || f.includes(n)) {
        inclLen = f.length;
        inclTeam = team;
      }
    }
  }
  if (inclTeam) return inclTeam;

  // 3. Repli : plus longue sous-chaine commune (min 5 caracteres)
  //    Rattrape "Stade Toulousain" -> Toulouse, "Aviron Bayonnais" -> Bayonne.
  let subTeam = null;
  let subLen = 4;
  for (const team of teams) {
    for (const field of [team.name, team.city]) {
      const s = commonLength(n, normalize(field));
      if (s > subLen) {
        subLen = s;
        subTeam = team;
      }
    }
  }
  return subTeam;
}

// --- Selection des journees a interroger --------------------------------------

/**
 * Journees ayant encore au moins un match passe sans resultat.
 * Evite le plafond de l'API sur la saison complete : on interroge journee par journee.
 */
async function getRoundsToSync() {
  const pending = await prisma.match.findMany({
    where: { kickoff: { lt: new Date() }, status: { not: 'FINISHED' }, season: SEASON },
    select: { round: true },
    distinct: ['round'],
    orderBy: { round: 'desc' },
    take: MAX_ROUNDS,
  });
  if (pending.length) return pending.map((r) => r.round);

  // Rien en attente : on renvoie la derniere journee jouee, utile pour une verification manuelle
  const last = await prisma.match.findFirst({
    where: { kickoff: { lt: new Date() }, season: SEASON },
    orderBy: { kickoff: 'desc' },
    select: { round: true },
  });
  return last ? [last.round] : [];
}

// --- Synchronisation ----------------------------------------------------------

/**
 * Recupere les resultats depuis TheSportsDB et met la base a jour.
 * @param {{ dryRun?: boolean, rounds?: number[] }} options
 *        dryRun = simule sans rien ecrire
 *        rounds = forcer certaines journees (sinon calculees automatiquement)
 */
async function syncResults({ dryRun = false, rounds = null } = {}) {
  const targetRounds = rounds && rounds.length ? rounds : await getRoundsToSync();

  const report = {
    ok: true,
    dryRun,
    rounds: targetRounds,
    fetched: 0,
    updated: 0,
    skipped: 0,
    unmatched: [],
    changes: [],
  };

  if (!targetRounds.length) {
    report.reason = 'Aucune journee a synchroniser';
    return report;
  }

  const teams = await prisma.team.findMany();

  for (const round of targetRounds) {
    const url = `${BASE}/eventsround.php?id=${LEAGUE_ID}&r=${round}&s=${SEASON}`;

    let events = [];
    try {
      const { data } = await axios.get(url, { timeout: 15000 });
      events = (data && data.events) || [];
    } catch (err) {
      console.error(`[sync] J${round} : appel API echoue (${err.message})`);
      continue;
    }

    report.fetched += events.length;
    if (!events.length) {
      console.warn(`[sync] J${round} : aucun match renvoye par l'API`);
    }

    for (const ev of events) {
      const homeScore = parseInt(ev.intHomeScore, 10);
      const awayScore = parseInt(ev.intAwayScore, 10);

      // Match pas encore joue : aucun score renvoye
      if (Number.isNaN(homeScore) || Number.isNaN(awayScore)) {
        report.skipped++;
        continue;
      }

      // 1. Retrouver le match en base par externalId (rapide et sur)
      let match = await prisma.match.findFirst({ where: { externalId: String(ev.idEvent) } });

      // 2. Sinon par la paire d'equipes (unique par saison en Top 14)
      if (!match) {
        const home = resolveTeam(ev.strHomeTeam, teams);
        const away = resolveTeam(ev.strAwayTeam, teams);

        if (!home || !away) {
          const which = [!home && ev.strHomeTeam, !away && ev.strAwayTeam].filter(Boolean).join(' + ');
          report.unmatched.push(`J${round} equipe non reconnue : ${which}`);
          continue;
        }

        match = await prisma.match.findFirst({
          where: { homeTeamId: home.id, awayTeamId: away.id, season: SEASON },
        });

        if (!match) {
          report.unmatched.push(`J${round} ${ev.strHomeTeam} vs ${ev.strAwayTeam} : absent de la base`);
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

    await sleep(500);   // on reste large sous la limite de l'API gratuite
  }

  if (report.unmatched.length) {
    console.warn('[sync] non reconnus :', report.unmatched);
  }
  console.log(
    `[sync] ${dryRun ? '(simulation) ' : ''}journees ${targetRounds.join(', ')} : ` +
    `${report.updated} mis a jour, ${report.skipped} ignores`
  );

  return report;
}

/**
 * Faut-il interroger l'API ?
 * Oui seulement s'il reste au moins un match passe non marque FINISHED.
 */
async function shouldSync() {
  const pending = await prisma.match.count({
    where: { kickoff: { lt: new Date() }, status: { not: 'FINISHED' }, season: SEASON },
  });
  return pending > 0;
}

module.exports = { syncResults, shouldSync, resolveTeam, getRoundsToSync };