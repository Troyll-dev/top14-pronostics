const { PrismaClient } = require('@prisma/client');
const { calculatePoints } = require('../controllers/match.controller');
const sportsdb = require('./sources/thesportsdb');
const espn = require('./sources/espn');

const prisma = new PrismaClient();

const SEASON     = process.env.SPORTSDB_SEASON || '2026-2027';
const MAX_ROUNDS = 4;

// Au-dela de ce delai apres le coup d'envoi, une rencontre ne peut plus etre en
// cours. Sert uniquement quand aucune source ne se prononce sur l'etat.
const LIVE_WINDOW_MS = 2.5 * 60 * 60 * 1000;

// On continue d'interroger les sources pendant ce delai apres un coup d'envoi,
// meme si le match est deja marque termine : c'est ce qui rattrape une
// publication tardive ou une correction.
const RECHECK_WINDOW_MS = 12 * 60 * 60 * 1000;

/**
 * Noms de sources -> nom, shortName ou ville dans la base.
 * Les cles sont normalisees. Un alias qui ne correspond a rien est sans effet :
 * on retombe simplement sur la reconnaissance approximative.
 */
const OVERRIDES = {
  sectionpaloise: 'Pau',
  pau: 'Pau',
  toulon: 'RC Toulon',
  toulouse: 'Stade Toulousain',
  lyon: 'LOU Rugby',
  lyonou: 'LOU Rugby',
  bayonne: 'Aviron Bayonnais',
  larochelle: 'Stade Rochelais',
  clermontauvergne: 'ASM Clermont',
  montpellierherault: 'Montpellier HR',
  perpignan: 'USA Perpignan',
  vannes: 'RC Vannes',
  bordeauxbegles: 'Union Bordeaux-Begles',
  stadefrancais: 'Stade Francais',
  racing92: 'Racing 92',
  racingmetro92: 'Racing 92',
};

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
  const n = normalize(apiName);
  if (!n) return null;

  const ov = OVERRIDES[n];
  if (ov) {
    const o = normalize(ov);
    const t = teams.find((x) => [x.name, x.shortName, x.city].some((f) => f && normalize(f) === o));
    if (t) return t;
  }

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

/**
 * Une source dit-elle que le score est definitif ?
 * true / false quand elle se prononce, sinon on tranche a l'heure.
 */
function impliedFinal(cand, kickoff, now) {
  if (cand.final === true) return true;
  if (cand.final === false) return false;
  if (!kickoff) return false;
  return now - new Date(kickoff).getTime() > LIVE_WINDOW_MS;
}

/**
 * Confronte les sources et decide ce qu'on ecrit.
 *
 * - une seule source definitive, ou plusieurs d'accord  -> score definitif
 * - des sources definitives qui se contredisent         -> rien de definitif,
 *   on garde le score le plus avance et on signale le desaccord
 * - aucune source definitive                            -> score provisoire,
 *   celui qui a le total le plus eleve, donc le plus avance dans le match
 */
function decide(cands, kickoff, now) {
  const scored = cands.filter((c) => c.homeScore !== null && c.awayScore !== null);
  if (!scored.length) return null;

  const finals = scored.filter((c) => impliedFinal(c, kickoff, now));
  const latest = [...scored].sort(
    (a, b) => (b.homeScore + b.awayScore) - (a.homeScore + a.awayScore)
  )[0];

  if (!finals.length) {
    return { homeScore: latest.homeScore, awayScore: latest.awayScore, final: false, from: latest.source };
  }

  const distinct = [...new Set(finals.map((c) => `${c.homeScore}-${c.awayScore}`))];
  if (distinct.length === 1) {
    return {
      homeScore: finals[0].homeScore,
      awayScore: finals[0].awayScore,
      final: true,
      from: finals.map((c) => c.source).join('+'),
    };
  }

  return {
    homeScore: latest.homeScore,
    awayScore: latest.awayScore,
    final: false,
    from: latest.source,
    conflict: finals.map((c) => `${c.source} ${c.homeScore}-${c.awayScore}`).join(' vs '),
  };
}

// Journees a relire : celles qui ont un match passe non termine, et celles
// dont un match a demarre dans les douze dernieres heures.
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
    where: { kickoff: { lt: now, }, season: SEASON },
    orderBy: { kickoff: 'desc' }, select: { round: true },
  });
  return last ? [last.round] : [];
}

async function syncResults({ dryRun = false, rounds = null } = {}) {
  const now = Date.now();
  const targets = rounds && rounds.length ? rounds : await getRoundsToSync();
  const report = {
    ok: true, dryRun, rounds: targets, sources: {},
    updated: 0, live: 0, skipped: 0, conflicts: [], unmatched: [], changes: [],
  };
  if (!targets.length) { report.reason = 'Aucune journee a synchroniser'; return report; }

  const teams = await prisma.team.findMany();

  // ESPN ne connait pas la notion de journee : un seul appel, puis on rapproche
  // par les equipes.
  const espnEvents = await espn.fetchCurrent();
  report.sources.espn = espnEvents === null ? 'injoignable' : `${espnEvents.length} rencontres`;

  const espnIndex = new Map();
  for (const ev of espnEvents || []) {
    const h = resolveTeam(ev.home, teams);
    const a = resolveTeam(ev.away, teams);
    if (!h || !a) {
      report.unmatched.push(`espn : ${ev.home} vs ${ev.away} non reconnu`);
      continue;
    }
    espnIndex.set(`${h.id}-${a.id}`, ev);
  }

  for (const round of targets) {
    const events = await sportsdb.fetchRound(round, SEASON);
    if (events === null) { report.sources[`thesportsdb J${round}`] = 'injoignable'; continue; }
    report.sources[`thesportsdb J${round}`] = `${events.length} rencontres`;

    for (const ev of events) {
      let match = await prisma.match.findFirst({ where: { externalId: ev.externalId } });

      if (!match) {
        const home = resolveTeam(ev.home, teams);
        const away = resolveTeam(ev.away, teams);
        if (!home || !away) {
          const which = [!home && ev.home, !away && ev.away].filter(Boolean).join(' + ');
          report.unmatched.push(`J${round} equipe non reconnue : ${which}`);
          continue;
        }
        match = await prisma.match.findFirst({
          where: { homeTeamId: home.id, awayTeamId: away.id, season: SEASON },
        });
        if (!match) {
          report.unmatched.push(`J${round} ${ev.home} vs ${ev.away} : absent de la base`);
          continue;
        }
      }

      const second = espnIndex.get(`${match.homeTeamId}-${match.awayTeamId}`) || null;
      const kickoff = ev.kickoff || (second && second.kickoff) || new Date(match.kickoff);

      // Heure officielle : la base a ete semee avec des horaires approximatifs,
      // or c'est l'heure qui decide de « en cours » et de la cloture des pronos.
      const shift = Math.abs(new Date(kickoff).getTime() - new Date(match.kickoff).getTime());
      const fixKickoff = shift > 10 * 60 * 1000;

      const verdict = decide([ev, second].filter(Boolean), kickoff, now);

      if (!verdict) {
        if (fixKickoff && !dryRun) {
          await prisma.match.update({ where: { id: match.id }, data: { kickoff: new Date(kickoff) } });
          report.changes.push(`J${match.round} ${ev.home}–${ev.away} : horaire corrige`);
          report.updated++;
        } else {
          report.skipped++;
        }
        continue;
      }

      if (verdict.conflict) {
        report.conflicts.push(`J${match.round} ${ev.home}–${ev.away} : ${verdict.conflict}`);
        console.warn(`[sync] desaccord ${ev.home}–${ev.away} : ${verdict.conflict}`);
      }

      // Un match deja termine n'est jamais rouvert par un score provisoire.
      // Sans cette regle, une source figee sur un score de 60e minute — ou une
      // correction saisie a la main — serait ecrasee au passage suivant.
      if (!verdict.final && match.status === 'FINISHED') {
        report.skipped++; continue;
      }

      const status = verdict.final ? 'FINISHED' : 'LIVE';
      const sameScore = match.homeScore === verdict.homeScore && match.awayScore === verdict.awayScore;
      if (sameScore && match.status === status && !fixKickoff) { report.skipped++; continue; }

      const label =
        `J${match.round} ${ev.home} ${verdict.homeScore}-${verdict.awayScore} ${ev.away}` +
        (verdict.final ? ` [${verdict.from}]` : ` (en cours, ${verdict.from})`);
      report.changes.push(label);
      if (!verdict.final) report.live++;
      if (dryRun) { report.updated++; continue; }

      const data = {
        homeScore: verdict.homeScore,
        awayScore: verdict.awayScore,
        status,
        externalId: match.externalId || ev.externalId,
      };
      if (fixKickoff) data.kickoff = new Date(kickoff);

      let updated;
      try {
        updated = await prisma.match.update({ where: { id: match.id }, data });
      } catch (err) {
        // Filet : si l'enum MatchStatus de la base n'a pas de valeur LIVE, on
        // enregistre le score sans toucher au statut plutot que d'echouer.
        if (status !== 'LIVE') throw err;
        console.warn('[sync] statut LIVE refuse par la base, score enregistre sans changement de statut');
        delete data.status;
        updated = await prisma.match.update({ where: { id: match.id }, data });
      }

      // Les points ne sont attribues que sur un score definitif : sinon le
      // classement des pronos sauterait a chaque essai marque.
      if (verdict.final) await calculatePoints(updated);

      report.updated++;
      console.log(`[sync] ${label}`);
    }
  }

  if (report.unmatched.length) console.warn('[sync] non reconnus :', report.unmatched);
  console.log(
    `[sync] ${dryRun ? '(simulation) ' : ''}J${targets.join(', J')} : ` +
    `${report.updated} mis a jour (dont ${report.live} en cours), ${report.skipped} ignores` +
    (report.conflicts.length ? `, ${report.conflicts.length} desaccord(s)` : '')
  );
  return report;
}

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
  decide, impliedFinal, LIVE_WINDOW_MS, RECHECK_WINDOW_MS,
};
