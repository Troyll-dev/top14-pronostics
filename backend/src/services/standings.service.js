const lnr = require('./sources/lnr');
const classement = require('./sources/lnr-classement');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const SEASON = process.env.SPORTSDB_SEASON || '2026-2027';
/**
 * Un mot sur ce qui n'est plus la.
 *
 * Ce fichier a longtemps contenu un analyseur du tableau d'allrugby : une liste
 * des quatorze clubs avec leurs libelles, une table de vingt-quatre colonnes, et
 * de quoi retrouver une ligne de classement dans un HTML quelconque. Environ
 * cent quarante lignes.
 *
 * Il ne servait plus depuis qu'on avait cesse de lire allrugby, et il ne pouvait
 * plus servir du tout depuis qu'on lit le tableau officiel de la LNR. Il restait
 * la, exporte, teste par personne, et surtout : il donnait l'impression qu'un
 * second chemin existait. C'est la seule chose qu'il faisait encore.
 */

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

/**
 * Le classement, lu sur la page officielle de la LNR. Un seul chemin.
 *
 * Trois epoques, et la troisieme est la bonne.
 *
 * 1. On lisait un tableau tout fait sur allrugby. Il a cesse de fonctionner le
 *    19 septembre sans rien dire, et l'application a servi un instantane perime
 *    pendant quatre jours.
 *
 * 2. On a donc **recalcule** le classement a partir des resultats, en
 *    additionnant victoires, nuls et bonus. Le motif ecrit a l'epoque etait que
 *    la page classement de la LNR « est construite dans le navigateur ».
 *    C'etait faux, et jamais verifie.
 *
 * 3. Elle est rendue par le serveur. On lit donc le tableau **officiel**, celui
 *    qui fait autorite, avec ses points de penalisation eventuels et ses
 *    departages deja appliques — choses qu'aucun recalcul ne peut deviner.
 *
 * Le recalcul a ete supprime, et non garde en secours. C'est un choix, et il se
 * defend : un chemin de secours qui ne tourne jamais n'est pas teste, donc il ne
 * marche pas le jour ou l'on compte sur lui. Deux facons de produire un
 * classement, c'est aussi deux facons d'etre faux — et l'une des deux
 * silencieusement, puisqu'un classement recalcule ressemble en tout point a un
 * classement officiel.
 *
 * En echange, cette fonction **leve** quand la page est illisible, et n'ecrit
 * rien. Le tableau en base reste celui de la veille, et c'est la mesure de
 * fraicheur (voir plus bas) qui le signale : elle compare le nombre de
 * rencontres comptees au nombre de rencontres terminees, et dit « en retard de
 * sept matchs » des le lendemain. C'est ce garde-fou-la qui remplace le secours,
 * et lui, il tourne toutes les trois minutes.
 */

/** La forme attendue par le reste de l'application, depuis le tableau officiel. */
function depuisOfficiel(lignes) {
  return lignes.map((l) => ({
    slug: l.slug,
    rank: l.rank,
    played: l.played,
    won: l.won,
    drawn: l.drawn,
    lost: l.lost,
    pointsFor: l.pointsFor,
    pointsAgainst: l.pointsAgainst,
    diff: l.diff,
    points: l.points,
    bonus: l.bonus,
    // La page donne le total des bonus, pas leur repartition offensif /
    // defensif. On rend donc `null` plutot que zero : une case vide assumee vaut
    // mieux qu'un zero qui se lit comme « aucun bonus offensif ».
    bonusOff: null,
    bonusDef: null,
    triesFor: null,
    triesAgainst: null,
    // Nouveau, et gratuit : la LNR les publie dans le meme tableau.
    variation: l.variation,
    formeLnr: l.forme,
    prochain: l.prochain,
  }));
}

async function syncStandings({ dryRun = false } = {}) {
  const report = { source: 'lnr-classement', season: SEASON, rounds: [], table: [], unmatched: [] };

  // Pas de try/catch : si la page est illisible, l'erreur remonte et rien n'est
  // ecrit. Le cron la journalise, le tableau de la veille reste servi, et la
  // mesure de fraicheur annonce le retard. Avaler l'erreur ici serait refaire
  // exactement la panne d'allrugby.
  const officiel = await classement.fetchClassement({ season: SEASON });

  const lignes = depuisOfficiel(officiel.lignes);
  report.journeeAnnoncee = officiel.journeeAnnoncee;
  report.journeesJouees = officiel.journeesJouees;
  report.rounds = officiel.journeesJouees ? [officiel.journeesJouees] : [];

  report.unmatched = await attachTeamsBySlug(lignes);
  report.table = lignes;

  if (dryRun) return report;

  await prisma.leagueTable.upsert({
    where: { season: SEASON },
    update: { data: report.table, source: report.source, fetchedAt: new Date() },
    create: { season: SEASON, data: report.table, source: report.source },
  });

  console.log(
    `[classement] officiel : 14 clubs enregistres, ${officiel.journeesJouees} journees`
  );
  return report;
}

/**
 * Le classement reflete-t-il tous les resultats connus ?
 *
 * La question n'est pas « depuis quand a-t-il ete relu ». Hors periode de
 * championnat, un tableau vieux de cinq jours est parfaitement juste : rien ne
 * s'est joue. Un delai fixe declencherait une alerte fausse a chaque treve, et
 * une alerte fausse qu'on apprend a ignorer ne sert plus a rien le jour ou elle
 * est vraie.
 *
 * Ce n'est pas non plus « a-t-il ete calcule apres le dernier resultat ». Cette
 * mesure-la parait bonne et ne l'est pas, on l'a verifie a nos depens sur la J4
 * 2026-2027 : ESPN a declare Pau–La Rochelle termine, la base l'a enregistre,
 * le recalcul s'est declenche — mais la LNR n'avait pas encore publie le score.
 * Le classement a donc ete calcule APRES le resultat tout en l'ignorant. Il
 * etait faux, et par cette mesure il se serait declare a jour.
 *
 * La bonne question est donc : **le tableau compte-t-il autant de rencontres
 * que la base en connait de terminees ?** Chaque rencontre apparait dans la
 * ligne de deux clubs, d'ou la division par deux. C'est une comparaison de
 * contenu et non de dates : elle ne peut pas etre trompee par l'ordre des
 * evenements.
 */
async function fraicheur(snap) {
  const termines = await prisma.match.count({
    where: { season: SEASON, status: 'FINISHED' },
  });

  const lignes = snap?.data || [];
  if (!lignes.length) return { aJour: false, retard: termines, comptees: 0, termines };

  const comptees = Math.round(lignes.reduce((s, r) => s + (r.played || 0), 0) / 2);

  return {
    // Superieur et non egal : la LNR peut avoir publie un resultat que la base
    // n'a pas encore enregistre. Le tableau est alors en avance, pas en retard.
    aJour: comptees >= termines,
    retard: Math.max(0, termines - comptees),
    comptees,
    termines,
  };
}

/**
 * L'etat de fraicheur seul, sans le tableau ni la forme des equipes.
 *
 * `getStandings` recalcule la forme de chaque club, ce qui n'a aucun interet
 * pour une tache qui veut seulement savoir s'il faut relancer le calcul — et
 * qui pose la question toutes les trois minutes pendant neuf heures.
 */
async function etatFraicheur() {
  const snap = await prisma.leagueTable.findUnique({ where: { season: SEASON } });
  return fraicheur(snap);
}

async function getStandings() {
  const snap = await prisma.leagueTable.findUnique({ where: { season: SEASON } });
  const form = await computeForm();

  const table = (snap?.data || []).map((row) => ({
    ...row,
    form: form[row.teamId] || null,
  }));

  const etat = await fraicheur(snap);

  return {
    table,
    fetchedAt: snap?.fetchedAt || null,
    source: snap?.source || null,
    season: SEASON,
    fraicheur: etat,
  };
}

module.exports = {
  syncStandings, getStandings, computeForm, weatherFor,
  fraicheur, etatFraicheur, depuisOfficiel,
};
