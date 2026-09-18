const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const { calculatePoints } = require('../controllers/match.controller');

const prisma = new PrismaClient();

const API_KEY    = process.env.SPORTSDB_KEY    || '123';
const SEASON     = process.env.SPORTSDB_SEASON || '2026-2027';
const LEAGUE_ID  = 4430;
const BASE       = `https://www.thesportsdb.com/api/v1/json/${API_KEY}`;
const MAX_ROUNDS = 4;

// Nom TheSportsDB (minuscules) -> name, shortName ou city dans ta base
const OVERRIDES = {
  'section paloise': 'Pau',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalize(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

function commonLength(a, b) {
  if (!a || !b) return 0;
  let best = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = i + best + 1; j <= a.length; j++) {
      if (b.includes(a.slice(i, j))) best = j - i; else break;
    }
  }
  return best;
}

function resolveTeam(apiName, teams) {
  const ov = OVERRIDES[(apiName || '').toLowerCase()];
  if (ov) {
    const o = normalize(ov);
    const t = teams.find((x) => [x.name, x.shortName, x.city].some((f) => f && normalize(f) === o));
    if (t) return t;
  }
  const n = normalize(apiName);
  if (!n) return null;

  // 1. exact (shortName autorise ici)
  const exact = teams.find((x) => [x.name, x.shortName, x.city].some((f) => f && normalize(f) === n));
  if (exact) return exact;

  // Les passes approximatives ignorent shortName : "LOU" se retrouve dans "Stade Tou-lou-sain"

  // 2. inclusion complete, min 4 caracteres, le champ le plus long gagne
  let iT = null, iL = 3;
  for (const t of teams) for (const f0 of [t.name, t.city]) {
    const f = normalize(f0);
    if (!f || f.length <= iL) continue;
    if (n.includes(f) || f.includes(n)) { iL = f.length; iT = t; }
  }
  if (iT) return iT;

  // 3. plus longue sous-chaine commune, min 5 caracteres
  let sT = null, sL = 4;
  for (const t of teams) for (const f0 of [t.name, t.city]) {
    const s = commonLength(n, normalize(f0));
    if (s > sL) { sL = s; sT = t; }
  }
  return sT;
}

// Journees ayant encore un match passe sans resultat (evite le plafond de l'API)
async function getRoundsToSync() {
  const pending = await prisma.match.findMany({
    where: { kickoff: { lt: new Date() }, status: { not: 'FINISHED' }, season: SEASON },
    select: { round: true }, distinct: ['round'], orderBy: { round: 'desc' }, take: MAX_ROUNDS,
  });
  if (pending.length) return pending.map((r) => r.round);

  const last = await prisma.match.findFirst({
    where: { kickoff: { lt: new Date() }, season: SEASON },
    orderBy: { kickoff: 'desc' }, select: { round: true },
  });
  return last ? [last.round] : [];
}

async function syncResults({ dryRun = false, rounds = null } = {}) {
  const targets = rounds && rounds.length ? rounds : await getRoundsToSync();
  const report = { ok: true, dryRun, rounds: targets, fetched: 0, updated: 0, skipped: 0, unmatched: [], changes: [] };
  if (!targets.length) { report.reason = 'Aucune journee a synchroniser'; return report; }

  const teams = await prisma.team.findMany();

  for (const round of targets) {
    let events = [];
    try {
      const { data } = await axios.get(
        `${BASE}/eventsround.php?id=${LEAGUE_ID}&r=${round}&s=${SEASON}`, { timeout: 15000 });
      events = (data && data.events) || [];
    } catch (err) {
      console.error(`[sync] J${round} : appel API echoue (${err.message})`);
      continue;
    }
    report.fetched += events.length;

    for (const ev of events) {
      const hs = parseInt(ev.intHomeScore, 10);
      const as = parseInt(ev.intAwayScore, 10);
      if (Number.isNaN(hs) || Number.isNaN(as)) { report.skipped++; continue; }

      let match = await prisma.match.findFirst({ where: { externalId: String(ev.idEvent) } });

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

      if (match.status === 'FINISHED' && match.homeScore === hs && match.awayScore === as) {
        report.skipped++; continue;
      }

      const label = `J${match.round} ${ev.strHomeTeam} ${hs}-${as} ${ev.strAwayTeam}`;
      report.changes.push(label);
      if (dryRun) { report.updated++; continue; }

      const updated = await prisma.match.update({
        where: { id: match.id },
        data: { homeScore: hs, awayScore: as, status: 'FINISHED', externalId: match.externalId || String(ev.idEvent) },
      });
      await calculatePoints(updated);
      report.updated++;
      console.log(`[sync] ${label}`);
    }
    await sleep(500);
  }

  if (report.unmatched.length) console.warn('[sync] non reconnus :', report.unmatched);
  console.log(`[sync] ${dryRun ? '(simulation) ' : ''}J${targets.join(', J')} : ${report.updated} mis a jour, ${report.skipped} ignores`);
  return report;
}

async function shouldSync() {
  const pending = await prisma.match.count({
    where: { kickoff: { lt: new Date() }, status: { not: 'FINISHED' }, season: SEASON },
  });
  return pending > 0;
}

module.exports = { syncResults, shouldSync, resolveTeam, getRoundsToSync };