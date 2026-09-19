const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const SEASON = process.env.SPORTSDB_SEASON || '2026-2027';
const URL = process.env.STANDINGS_URL || 'https://www.allrugby.com/competitions/top-14/classement.html';

/**
 * Libelles utilises par allrugby -> shortName dans notre base.
 * Les libelles les plus longs passent en premier : "La Rochelle" doit etre
 * reconnu avant "Rochelle", et "Racing 92" avant que le 92 ne soit pris
 * pour une statistique.
 */
const CLUBS = [
  { label: 'Racing 92',   short: 'R92'  },
  { label: 'La Rochelle', short: 'SR'   },
  { label: 'Montpellier', short: 'MHR'  },
  { label: 'Perpignan',   short: 'USAP' },
  { label: 'Bordeaux',    short: 'UBB'  },
  { label: 'Clermont',    short: 'ASM'  },
  { label: 'Toulouse',    short: 'TLS'  },
  { label: 'Castres',     short: 'CO'   },
  { label: 'Bayonne',     short: 'AB'   },
  { label: 'Vannes',      short: 'RCV'  },
  { label: 'Toulon',      short: 'RCT'  },
  { label: 'Paris',       short: 'SFP'  },
  { label: 'Lyon',        short: 'LOU'  },
  { label: 'Pau',         short: 'PAU'  },
];

/**
 * Position de chaque statistique dans la suite de nombres qui suit le nom du
 * club. Ordre observe sur allrugby :
 *   Pts, J, G, N, P, p, Moy p, c, Moy c, Diff, EP, EC, BO, BD
 * Si la page change d'ordre, seules ces constantes sont a corriger — le mode
 * diagnostic renvoie les nombres bruts pour le verifier.
 */
const COL = {
  points: 0,
  played: 1,
  won: 2,
  drawn: 3,
  lost: 4,
  pointsFor: 5,
  pointsAgainst: 7,
  diff: 9,
  triesFor: 10,
  triesAgainst: 11,
  bonusOff: 12,
  bonusDef: 13,
};
const MIN_NUMBERS = 14;

// --- Lecture de la page -------------------------------------------------------

/** Transforme le HTML en lignes de texte, une par ligne de tableau. */
function toLines(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/t[dh]>/gi, ' ¦ ')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[ \t ]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Nombres isoles d'une chaine : on ignore ceux colles a des lettres (R92, U18...). */
function numbersIn(str) {
  const out = [];
  const re = /(^|[^\w.,])(-?\d+(?:[.,]\d+)?)(?![\w])/g;
  let m;
  while ((m = re.exec(str)) !== null) out.push(parseFloat(m[2].replace(',', '.')));
  return out;
}

/**
 * Extrait le classement du HTML.
 * @returns {{ rows: Array, misses: string[] }}
 */
function parseTable(html) {
  const lines = toLines(html);
  const rows = [];
  const misses = [];

  for (const club of CLUBS) {
    // On retient, parmi toutes les lignes citant le club, celle qui porte
    // assez de nombres pour etre une ligne de classement.
    let best = null;
    for (const line of lines) {
      const at = line.indexOf(club.label);
      if (at === -1) continue;
      const nums = numbersIn(line.slice(at + club.label.length));
      if (nums.length >= MIN_NUMBERS && (!best || nums.length < best.nums.length)) {
        best = { line, nums };
      }
    }

    if (!best) {
      misses.push(club.label);
      continue;
    }

    const n = best.nums;
    rows.push({
      label: club.label,
      shortName: club.short,
      points: n[COL.points],
      played: n[COL.played],
      won: n[COL.won],
      drawn: n[COL.drawn],
      lost: n[COL.lost],
      pointsFor: n[COL.pointsFor],
      pointsAgainst: n[COL.pointsAgainst],
      diff: n[COL.diff],
      triesFor: n[COL.triesFor],
      triesAgainst: n[COL.triesAgainst],
      bonusOff: n[COL.bonusOff],
      bonusDef: n[COL.bonusDef],
      raw: n.slice(0, 20),
    });
  }

  // Classement : points, puis difference, puis essais marques
  rows.sort(
    (a, b) =>
      b.points - a.points ||
      b.diff - a.diff ||
      b.triesFor - a.triesFor ||
      a.label.localeCompare(b.label)
  );
  rows.forEach((r, i) => { r.rank = i + 1; });

  return { rows, misses };
}

// --- Rattachement aux equipes de la base --------------------------------------

async function attachTeams(rows) {
  const teams = await prisma.team.findMany();
  const byShort = {};
  for (const t of teams) byShort[t.shortName] = t;

  // Castres peut etre stocke en CAO ou en CO selon que la base a ete alignee
  const alias = { CO: ['CO', 'CAO'], CAO: ['CAO', 'CO'] };

  const unmatched = [];
  for (const r of rows) {
    const candidates = alias[r.shortName] || [r.shortName];
    const team = candidates.map((c) => byShort[c]).find(Boolean);
    if (team) {
      r.teamId = team.id;
      r.name = team.name;
      r.shortName = team.shortName;
    } else {
      unmatched.push(`${r.label} (${r.shortName})`);
      r.name = r.label;
    }
  }
  return unmatched;
}

// --- Forme des equipes, calculee sur nos propres matchs ------------------------

const WEATHER = {
  sun:   { icon: '☀️', label: 'En pleine forme' },
  sunny: { icon: '🌤️', label: 'Sur une bonne serie' },
  mixed: { icon: '⛅', label: 'Irregulier' },
  rain:  { icon: '🌧️', label: 'En difficulte' },
  storm: { icon: '⛈️', label: 'Dans la tourmente' },
};

function weatherFor(results) {
  // results : du plus recent au plus ancien, 'V' | 'N' | 'D'
  if (!results.length) return { key: 'mixed', ...WEATHER.mixed, streak: 0, streakType: null };

  const first = results[0];
  let streak = 0;
  for (const r of results) {
    if (r === first) streak++;
    else break;
  }

  let key = 'mixed';
  if (first === 'V') key = streak >= 3 ? 'sun' : streak === 2 ? 'sunny' : 'mixed';
  else if (first === 'D') key = streak >= 3 ? 'storm' : streak === 2 ? 'rain' : 'mixed';

  return { key, ...WEATHER[key], streak, streakType: first };
}

/** Cinq derniers resultats de chaque equipe, d'apres nos matchs termines. */
async function computeForm() {
  const matches = await prisma.match.findMany({
    where: { status: 'FINISHED', season: SEASON },
    orderBy: { kickoff: 'desc' },
    select: {
      homeTeamId: true, awayTeamId: true,
      homeScore: true, awayScore: true,
      round: true, kickoff: true,
    },
  });

  const byTeam = {};
  const push = (teamId, res, m, opponentId, scored, conceded) => {
    if (!byTeam[teamId]) byTeam[teamId] = [];
    if (byTeam[teamId].length < 5) {
      byTeam[teamId].push({ res, round: m.round, opponentId, scored, conceded });
    }
  };

  for (const m of matches) {
    if (m.homeScore === null || m.awayScore === null) continue;
    const h = m.homeScore > m.awayScore ? 'V' : m.homeScore < m.awayScore ? 'D' : 'N';
    const a = h === 'V' ? 'D' : h === 'D' ? 'V' : 'N';
    push(m.homeTeamId, h, m, m.awayTeamId, m.homeScore, m.awayScore);
    push(m.awayTeamId, a, m, m.homeTeamId, m.awayScore, m.homeScore);
  }

  const form = {};
  for (const [teamId, list] of Object.entries(byTeam)) {
    form[teamId] = {
      recent: list,
      weather: weatherFor(list.map((x) => x.res)),
    };
  }
  return form;
}

// --- Synchronisation ----------------------------------------------------------

/**
 * Lit le classement sur allrugby et l'enregistre en base.
 * @param {{ dryRun?: boolean, debug?: boolean }} options
 */
async function syncStandings({ dryRun = false, debug = false } = {}) {
  let html;
  try {
    const res = await axios.get(URL, {
      timeout: 20000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Top14PronosBot/1.0)',
        'Accept-Language': 'fr-FR,fr;q=0.9',
      },
    });
    html = res.data;
  } catch (err) {
    return { ok: false, reason: `Page inaccessible : ${err.message}` };
  }

  const { rows, misses } = parseTable(String(html));

  const report = {
    ok: rows.length > 0,
    dryRun,
    source: URL,
    found: rows.length,
    misses,
  };

  if (!rows.length) {
    report.reason = "Aucune ligne reconnue — la structure de la page a probablement change";
    if (debug) report.sample = toLines(String(html)).slice(0, 60);
    return report;
  }

  report.unmatched = await attachTeams(rows);
  report.table = rows.map(({ raw, ...r }) => (debug ? { ...r, raw } : r));

  if (dryRun) return report;

  await prisma.leagueTable.upsert({
    where: { season: SEASON },
    update: { data: report.table, source: 'allrugby', fetchedAt: new Date() },
    create: { season: SEASON, data: report.table, source: 'allrugby' },
  });

  console.log(`[classement] ${rows.length} equipes enregistrees`);
  return report;
}

/** Ce que l'application affiche : instantane en base + forme calculee. */
async function getStandings() {
  const snap = await prisma.leagueTable.findUnique({ where: { season: SEASON } });
  const form = await computeForm();

  const table = (snap?.data || []).map((row) => ({
    ...row,
    form: form[row.teamId] || null,
  }));

  return {
    table,
    fetchedAt: snap?.fetchedAt || null,
    source: snap?.source || null,
    season: SEASON,
  };
}

module.exports = { syncStandings, getStandings, computeForm, parseTable, weatherFor };
