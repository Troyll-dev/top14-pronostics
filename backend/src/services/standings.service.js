const axios = require('axios');
const lnr = require('./sources/lnr');
const { computeTable } = require('./standings-compute');
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
 * Decalage de chaque statistique par rapport a la cellule du club.
 * Releve sur la vraie page et verifie sur dix clubs : entre la difference
 * (+6) et les points marques (+16) s'intercalent le pourcentage de victoires
 * et un bloc de six cellules de forme, souvent vides.
 * Une cellule vide vaut zero — c'est ce qui faisait echouer la version
 * precedente, qui comptait les nombres au lieu des cellules.
 */
const COL = {
  points: 1,
  played: 2,
  won: 3,
  drawn: 4,
  lost: 5,
  diff: 6,
  pointsFor: 16,
  pointsAgainst: 17,
  triesFor: 20,
  triesAgainst: 21,
  bonusOff: 22,
  bonusDef: 23,
};
const LAST_COL = 23;

// --- Lecture de la page -------------------------------------------------------

/** Transforme le HTML en lignes de texte, les cellules separees par "|". */
function toLines(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/t[dh]>/gi, ' \u00a6 ')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[ \t\u00a0]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Valeur numerique d'une cellule ; vide ou non numerique vaut zero. */
function cellValue(cell) {
  if (cell === undefined) return 0;
  const m = String(cell).match(/-?\d+(?:[.,]\d+)?/);
  return m ? parseFloat(m[0].replace(',', '.')) : 0;
}

/**
 * Extrait le classement general.
 * Chaque club figure trois fois sur la page — general, domicile, exterieur.
 * On retient la ligne ou le nombre de matchs joues est le plus eleve : le
 * total general est toujours superieur a chacun de ses deux sous-totaux.
 */
function parseTable(html) {
  const lines = toLines(String(html));
  const rows = [];
  const misses = [];

  for (const club of CLUBS) {
    let best = null;

    lines.forEach((line, lineIndex) => {
      const cells = line.split('\u00a6');
      const clubIdx = cells.findIndex((c) => c.includes(club.label));
      if (clubIdx === -1) return;
      if (cells.length <= clubIdx + LAST_COL) return;

      const played = cellValue(cells[clubIdx + COL.played]);
      if (played <= 0) return;

      if (!best || played > best.played) best = { cells, clubIdx, played, lineIndex };
    });

    if (!best) {
      misses.push(club.label);
      continue;
    }

    const at = (offset) => cellValue(best.cells[best.clubIdx + offset]);
    rows.push({
      label: club.label,
      shortName: club.short,
      lineIndex: best.lineIndex,
      points: at(COL.points),
      played: at(COL.played),
      won: at(COL.won),
      drawn: at(COL.drawn),
      lost: at(COL.lost),
      pointsFor: at(COL.pointsFor),
      pointsAgainst: at(COL.pointsAgainst),
      diff: at(COL.diff),
      triesFor: at(COL.triesFor),
      triesAgainst: at(COL.triesAgainst),
      bonusOff: at(COL.bonusOff),
      bonusDef: at(COL.bonusDef),
      raw: best.cells.slice(best.clubIdx, best.clubIdx + LAST_COL + 1).map((c) => c.trim()),
    });
  }

  // On respecte l'ordre d'affichage du site, qui applique les departages
  // officiels ; les points ne servent que de filet.
  rows.sort((a, b) => a.lineIndex - b.lineIndex || b.points - a.points);
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
 * Classement Top 14 — calcule, plus scrape.
 *
 * L'ancienne version lisait un tableau tout fait sur allrugby. Elle a cesse de
 * fonctionner le 19 septembre et personne ne l'a su : quand la page changeait,
 * l'analyseur ne reconnaissait plus rien, n'ecrivait rien, et l'application
 * continuait de servir un instantane perime sans le signaler. Quatre jours.
 *
 * Desormais on lit les resultats sur le site de la LNR, qui homologue, et on
 * calcule le tableau. Le bareme est arithmetique, donc il ne peut pas deriver ;
 * la seule chose qui puisse casser est la lecture des pages, et celle-ci
 * echoue bruyamment plutot qu'en silence.
 */
async function attachTeamsBySlug(rows) {
  const teams = await prisma.team.findMany();
  const parNom = new Map(teams.map((x) => [x.name, x]));
  const parCourt = new Map(teams.map((x) => [x.shortName, x]));

  const inconnus = [];
  for (const r of rows) {
    const nom = lnr.SLUG_TO_NAME[r.slug];
    const team = (nom && parNom.get(nom)) || parCourt.get(r.slug.toUpperCase());
    if (team) {
      r.teamId = team.id;
      r.name = team.name;
      r.shortName = team.shortName;
    } else {
      r.name = nom || r.slug;
      inconnus.push(r.slug);
    }
  }
  return inconnus;
}

async function syncStandings({ dryRun = false } = {}) {
  const report = { source: 'lnr', season: SEASON, rounds: [], table: [], unmatched: [] };

  // Jusqu'ou lire : la derniere journee dont au moins un match est termine chez
  // nous. Inutile d'aller chercher des journees a venir, et cela evite de
  // marteler le site de la LNR avec vingt-six requetes a chaque passage.
  const joues = await prisma.match.findMany({
    where: { season: SEASON, status: 'FINISHED' },
    select: { round: true },
  });
  const derniere = joues.reduce((m, x) => Math.max(m, x.round || 0), 0);
  if (!derniere) {
    report.reason = 'aucun match termine en base : rien a classer';
    return report;
  }

  const matchs = [];
  for (let r = 1; r <= derniere; r += 1) {
    // fetchRound leve si la page ne rend pas ses sept rencontres. On laisse
    // remonter : mieux vaut une erreur visible qu'un classement ampute d'une
    // journee, qui aurait l'air juste et serait faux.
    matchs.push(...(await lnr.fetchRound(r)));
    report.rounds.push(r);
  }

  const lignes = computeTable(matchs);
  if (lignes.length !== 14) {
    throw new Error(`classement : ${lignes.length} clubs au lieu de 14 — rien n'a ete ecrit`);
  }

  report.unmatched = await attachTeamsBySlug(lignes);
  report.table = lignes;

  if (dryRun) return report;

  await prisma.leagueTable.upsert({
    where: { season: SEASON },
    update: { data: report.table, source: 'lnr', fetchedAt: new Date() },
    create: { season: SEASON, data: report.table, source: 'lnr' },
  });

  console.log(`[classement] calcule sur J1-J${derniere}, 14 clubs enregistres`);
  return report;
}

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
