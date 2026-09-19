const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const { calculatePoints } = require('../controllers/match.controller');

const prisma = new PrismaClient();

const API_KEY    = process.env.SPORTSDB_KEY    || '123';
const SEASON     = process.env.SPORTSDB_SEASON || '2026-2027';
const LEAGUE_ID  = 4430;
const BASE       = `https://www.thesportsdb.com/api/v1/json/${API_KEY}`;
const MAX_ROUNDS = 4;

// Duree au-dela de laquelle on considere qu'une rencontre ne peut plus etre en
// cours, quand l'API ne dit rien de son etat. Meme valeur que le frontend.
const LIVE_WINDOW_MS = 2.5 * 60 * 60 * 1000;

// On continue d'interroger l'API pendant ce delai apres le coup d'envoi, meme
// si le match est deja marque termine : c'est ce qui permet de rattraper un
// score releve trop tot.
const RECHECK_WINDOW_MS = 12 * 60 * 60 * 1000;

// Nom TheSportsDB (minuscules) -> name, shortName ou city dans ta base
const OVERRIDES = {
  'section paloise': 'Pau',
};

/**
 * Etats renvoyes par TheSportsDB pour une rencontre reellement terminee.
 * Tout le reste — 1H, HT, 2H, NS, chaine vide — signifie que le score affiche
 * est provisoire. C'est exactement le piege dans lequel la premiere version
 * etait tombee : elle marquait FINISHED des qu'un score existait, et figeait
 * donc le score a la minute ou le cron passait.
 */
const FINAL_STATUS = new Set(['FT', 'AET', 'AP', 'PEN', 'FT_PEN', 'MATCH FINISHED', 'FINISHED']);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalize(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
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

/** Coup d'envoi annonce par l'API, en UTC. strTimestamp est deja en UTC. */
function apiKickoff(ev) {
  const raw = ev.strTimestamp || (ev.dateEvent && ev.strTime ? `${ev.dateEvent}T${ev.strTime}` : null);
  if (!raw) return null;
  const d = new Date(raw.includes('T') ? `${raw}Z`.replace('ZZ', 'Z') : `${raw.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Le score est-il definitif ?
 * On fait confiance a strStatus quand il est renseigne. Sinon seulement, on
 * retombe sur l'heure : passe 2 h 30 apres le coup d'envoi, un score qui ne
 * bouge plus est un score final.
 */
function isFinal(ev, kickoff, now) {
  const st = (ev.strStatus || '').trim().toUpperCase();
  if (st) return FINAL_STATUS.has(st);
  if (!kickoff) return false;
  return now - kickoff.getTime() > LIVE_WINDOW_MS;
}

// Journees ayant encore un match passe sans resultat definitif, plus la
// derniere journee entamee (pour rattraper une correction tardive).
async function getRoundsToSync() {
  const now = new Date();
  const rounds = new Set();

  const pending = await prisma.match.findMany({
    where: { kickoff: { lt: now }, status: { not: 'FINISHED' }, season: SEASON },
    select: { round: true }, distinct: ['round'], orderBy: { round: 'desc' }, take: MAX_ROUNDS,
  });
  pending.forEach((r) => rounds.add(r.round));

  const recent = await prisma.match.findMany({
    where: { kickoff: { lt: now, gt: new Date(now - RECHECK_WINDOW_MS) }, season: SEASON },
    select: { round: true }, distinct: ['round'], orderBy: { round: 'desc' }, take: MAX_ROUNDS,
  });
  recent.forEach((r) => rounds.add(r.round));

  if (rounds.size) return [...rounds].sort((a, b) => b - a).slice(0, MAX_ROUNDS);

  const last = await prisma.match.findFirst({
    where: { kickoff: { lt: now }, season: SEASON },
    orderBy: { kickoff: 'desc' }, select: { round: true },
  });
  return last ? [last.round] : [];
}

async function syncResults({ dryRun = false, rounds = null } = {}) {
  const now = Date.now();
  const targets = rounds && rounds.length ? rounds : await getRoundsToSync();
  const report = {
    ok: true, dryRun, rounds: targets,
    fetched: 0, updated: 0, live: 0, skipped: 0, unmatched: [], changes: [],
  };
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
      const hasScore = !Number.isNaN(hs) && !Number.isNaN(as);

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

      // Heure officielle : la base a ete semee avec des horaires approximatifs,
      // or c'est l'heure qui decide de « en cours » et de la cloture des pronos.
      const kickoff = apiKickoff(ev);
      const kickoffShift = kickoff && Math.abs(kickoff.getTime() - new Date(match.kickoff).getTime());
      const fixKickoff = kickoff && kickoffShift > 10 * 60 * 1000 && match.status !== 'FINISHED';

      if (!hasScore) {
        if (fixKickoff && !dryRun) {
          await prisma.match.update({ where: { id: match.id }, data: { kickoff } });
          report.changes.push(`J${match.round} ${ev.strHomeTeam}–${ev.strAwayTeam} : horaire corrige`);
          report.updated++;
        } else {
          report.skipped++;
        }
        continue;
      }

      const final = isFinal(ev, kickoff || new Date(match.kickoff), now);
      const status = final ? 'FINISHED' : 'LIVE';

      // Rien de neuf : meme score, meme etat, meme horaire.
      if (match.homeScore === hs && match.awayScore === as && match.status === status && !fixKickoff) {
        report.skipped++; continue;
      }

      const label =
        `J${match.round} ${ev.strHomeTeam} ${hs}-${as} ${ev.strAwayTeam}` +
        (final ? '' : ` (en cours — ${ev.strStatus || 'score provisoire'})`);
      report.changes.push(label);
      if (!final) report.live++;
      if (dryRun) { report.updated++; continue; }

      const data = {
        homeScore: hs,
        awayScore: as,
        status,
        externalId: match.externalId || String(ev.idEvent),
      };
      if (fixKickoff) data.kickoff = kickoff;

      let updated;
      try {
        updated = await prisma.match.update({ where: { id: match.id }, data });
      } catch (err) {
        // Filet : si l'enum MatchStatus de ta base n'a pas de valeur LIVE, on
        // enregistre quand meme le score sans toucher au statut.
        if (status !== 'LIVE') throw err;
        console.warn('[sync] statut LIVE refuse par la base, score enregistre sans changement de statut');
        delete data.status;
        updated = await prisma.match.update({ where: { id: match.id }, data });
      }

      // Les points ne sont attribues que sur un score definitif : sinon le
      // classement des pronos sauterait a chaque essai marque.
      if (final) await calculatePoints(updated);

      report.updated++;
      console.log(`[sync] ${label}`);
    }
    await sleep(500);
  }

  if (report.unmatched.length) console.warn('[sync] non reconnus :', report.unmatched);
  console.log(
    `[sync] ${dryRun ? '(simulation) ' : ''}J${targets.join(', J')} : ` +
    `${report.updated} mis a jour (dont ${report.live} en cours), ${report.skipped} ignores`
  );
  return report;
}

/**
 * Faut-il appeler l'API ?
 * Oui s'il reste un match passe sans resultat, mais aussi pendant les heures
 * qui suivent une rencontre : un score releve en cours de match doit pouvoir
 * etre corrige. C'est le second morceau du bug — sans cela, un score provisoire
 * marque termine ne serait plus jamais relu.
 */
async function shouldSync() {
  const now = new Date();

  const pending = await prisma.match.count({
    where: { kickoff: { lt: now }, status: { not: 'FINISHED' }, season: SEASON },
  });
  if (pending > 0) return true;

  const recent = await prisma.match.count({
    where: { kickoff: { lt: now, gt: new Date(now - RECHECK_WINDOW_MS) }, season: SEASON },
  });
  return recent > 0;
}

module.exports = {
  syncResults, shouldSync, resolveTeam, getRoundsToSync,
  isFinal, apiKickoff, FINAL_STATUS, LIVE_WINDOW_MS, RECHECK_WINDOW_MS,
};
