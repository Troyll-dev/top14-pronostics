/**
 * Le classement du Tournoi des Six Nations, recalculé match par match.
 *
 * ---------------------------------------------------------------------------
 * POURQUOI LE RECALCULER
 * ---------------------------------------------------------------------------
 *
 * Pour le Top 14, on lit le tableau officiel de la LNR et on ne recalcule rien.
 * On aurait fait de même ici : le site du Tournoi publie un classement. Mais il
 * le charge dans le navigateur, depuis une API que la page ne montre pas — côté
 * serveur, le tableau est vide. Six sondes l'ont établi.
 *
 * Ce qu'il publie en clair, c'est la liste des points de chaque match joué :
 * essais, transformations, pénalités, drops. Et le règlement du Tournoi est
 * entièrement arithmétique :
 *
 *   victoire 4 · nul 2 · défaite 0
 *   + 1 point de bonus à partir de quatre essais marqués
 *   + 1 point de bonus pour une défaite de sept points ou moins
 *   + 3 points pour un Grand Chelem (cinq victoires sur cinq)
 *
 * Départage : points, puis différence de points, puis essais marqués.
 *
 * Il n'y a donc rien à deviner. Et chaque lecture est vérifiée : les points
 * marqués doivent redonner le score exact du match (voir `concorde` dans la
 * source). Une liste incomplète fait échouer le calcul — le tableau de la
 * veille reste servi, et la mesure de fraîcheur annonce le retard. C'est la
 * même discipline que pour le Top 14 : mieux vaut un tableau en retard et qui
 * le dit qu'un tableau faux qui se croit juste.
 *
 * ---------------------------------------------------------------------------
 * CE QU'IL ÉCRIT
 * ---------------------------------------------------------------------------
 *
 * Une ligne de `league_table`, sous la saison du Tournoi (« 2027 »), avec les
 * mêmes champs que le tableau du Top 14 — rang, points, joués, gagnés, nuls,
 * perdus, bonus, points marqués et encaissés, différence, prochain match — plus
 * les essais. La page Championnat les affiche donc sans rien savoir de plus.
 */

const { PrismaClient } = require('@prisma/client');
const source = require('./sources/six-nations');

const prisma = new PrismaClient();

/**
 * Les décomptes déjà lus, gardés en mémoire.
 *
 * Un match terminé ne change plus : inutile de relire sa page à chaque passe
 * horaire. Le cache est perdu au redémarrage du serveur, ce qui ne coûte
 * qu'une relecture.
 */
const DEJA_LUS = new Map();

const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];
const enClair = (d) => {
  const p = new Date(d).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'numeric' });
  const [jour, mois] = p.split('/').map(Number);
  return `${jour} ${MOIS[mois - 1]}`;
};

/** Une ligne vide, pour une nation qui n'a pas encore joué. */
const ligneVide = (code) => ({
  code,
  played: 0, won: 0, drawn: 0, lost: 0,
  pointsFor: 0, pointsAgainst: 0, diff: 0,
  triesFor: 0, triesAgainst: 0,
  bonus: 0, grandChelem: false, points: 0,
});

/**
 * Le tableau, à partir des rencontres et de leurs décomptes.
 *
 * Fonction pure : elle ne lit ni la base ni le réseau, ce qui permet de la
 * vérifier sur l'édition 2026 sans rien écrire.
 */
function calculer(rencontres) {
  const lignes = Object.fromEntries(Object.keys(source.NATIONS).map((c) => [c, ligneVide(c)]));

  for (const r of rencontres) {
    const h = lignes[r.home];
    const a = lignes[r.away];
    if (!h || !a) continue;
    const { home: dh, away: da } = r.decompte;

    h.played++; a.played++;
    h.pointsFor += r.homeScore; h.pointsAgainst += r.awayScore;
    a.pointsFor += r.awayScore; a.pointsAgainst += r.homeScore;
    h.triesFor += dh.essais; h.triesAgainst += da.essais;
    a.triesFor += da.essais; a.triesAgainst += dh.essais;

    const ecart = r.homeScore - r.awayScore;
    if (ecart > 0) { h.won++; a.lost++; if (ecart <= 7) a.bonus++; }
    else if (ecart < 0) { a.won++; h.lost++; if (-ecart <= 7) h.bonus++; }
    else { h.drawn++; a.drawn++; }

    if (dh.essais >= 4) h.bonus++;
    if (da.essais >= 4) a.bonus++;
  }

  const table = Object.values(lignes).map((l) => {
    l.diff = l.pointsFor - l.pointsAgainst;
    l.grandChelem = l.won === 5;
    l.points = 4 * l.won + 2 * l.drawn + l.bonus + (l.grandChelem ? 3 : 0);
    return l;
  });

  table.sort((x, y) =>
    y.points - x.points ||
    y.diff - x.diff ||
    y.triesFor - x.triesFor ||
    source.NATIONS[x.code].localeCompare(source.NATIONS[y.code], 'fr'));
  table.forEach((l, i) => { l.rank = i + 1; });
  return table;
}

/**
 * Lit les décomptes des rencontres terminées. Lève à la première qui ne se lit
 * pas : un classement auquel il manque un match est un classement faux.
 */
async function decomptes(matchs) {
  const sortie = [];
  for (const m of matchs.filter((x) => x.termine)) {
    const cle = `${m.annee}-${m.home}-${m.away}`;
    let d = DEJA_LUS.get(cle);
    if (!d) {
      if (!m.rapport) throw new Error(`${m.home}–${m.away} : pas de lien vers la feuille de match`);
      try {
        d = await source.fetchRapport(m.rapport);
      } catch (err) {
        throw new Error(`${m.home}–${m.away} : ${err.message}`);
      }
      // Le décompte doit être celui de la carte : même score, même ordre.
      if (d.home.score !== m.homeScore || d.away.score !== m.awayScore) {
        throw new Error(
          `${m.home}–${m.away} : la feuille dit ${d.home.score}–${d.away.score}, ` +
          `la carte ${m.homeScore}–${m.awayScore}`
        );
      }
      DEJA_LUS.set(cle, d);
    }
    sortie.push({ ...m, decompte: d });
  }
  return sortie;
}

/**
 * Recalcule le classement d'une édition, et l'enregistre sauf en simulation.
 *
 * `lu` est la lecture de la page des matchs, quand l'appelant l'a déjà faite
 * (la synchronisation du Tournoi) : inutile de la refaire.
 */
async function majClassement({ annee, lu = null, dryRun = false } = {}) {
  const lecture = lu || (await source.fetchSeason(annee));
  const rencontres = await decomptes(lecture.matchs);
  const table = calculer(rencontres);

  // Les équipes en base, retrouvées par leur nom français — c'est le nom que
  // la synchronisation leur a donné, et il ne change pas.
  const noms = Object.values(source.NATIONS);
  const equipes = await prisma.team.findMany({ where: { name: { in: noms } } });
  const parNom = new Map(equipes.map((t) => [t.name, t]));

  // Le prochain match de chaque nation, lu en base : c'est là que vit
  // l'horaire tenu à jour.
  const saison = String(annee);
  const avenir = await prisma.match.findMany({
    where: { competition: 'SIX_NATIONS', season: saison, status: { not: 'FINISHED' } },
    orderBy: { kickoff: 'asc' },
    include: { homeTeam: true, awayTeam: true },
  });

  // Le rang précédent, pour la flèche de progression.
  const avant = await prisma.leagueTable.findUnique({ where: { season: saison } });
  const rangAvant = new Map((avant?.data || []).map((r) => [r.shortName, r.rank]));

  const lignes = table.map((l) => {
    const t = parNom.get(source.NATIONS[l.code]);
    const prochain = t
      ? avenir.find((m) => m.homeTeamId === t.id || m.awayTeamId === t.id)
      : null;
    const avantRang = t ? rangAvant.get(t.shortName) : undefined;
    return {
      rank: l.rank,
      variation: avantRang ? avantRang - l.rank : 0,
      teamId: t?.id ?? null,
      name: t?.name ?? source.NATIONS[l.code],
      shortName: t?.shortName ?? l.code,
      points: l.points,
      played: l.played,
      won: l.won,
      drawn: l.drawn,
      lost: l.lost,
      bonus: l.bonus,
      grandChelem: l.grandChelem,
      pointsFor: l.pointsFor,
      pointsAgainst: l.pointsAgainst,
      diff: l.diff,
      triesFor: l.triesFor,
      triesAgainst: l.triesAgainst,
      formeLnr: null,
      prochain: prochain
        ? {
            domicile: prochain.homeTeamId === t.id,
            adversaire: prochain.homeTeamId === t.id ? prochain.awayTeam.name : prochain.homeTeam.name,
            date: enClair(prochain.kickoff),
            url: null,
          }
        : null,
    };
  });

  if (!dryRun) {
    await prisma.leagueTable.upsert({
      where: { season: saison },
      update: { data: lignes, source: 'sixnationsrugby.com', fetchedAt: new Date() },
      create: { season: saison, data: lignes, source: 'sixnationsrugby.com' },
    });
  }

  return { annee, matchs: rencontres.length, table: lignes, rencontres };
}

module.exports = { calculer, majClassement, decomptes };
