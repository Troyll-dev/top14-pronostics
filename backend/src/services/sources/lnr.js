/**
 * Source LNR — le site officiel du Top 14.
 *
 * Pourquoi celle-ci. ESPN annonce encore certains matchs joues comme « a
 * venir » et TheSportsDB reste bloque sur des scores provisoires ; les deux
 * nous ont menti sur des journees entieres. La LNR, elle, fait autorite : c'est
 * elle qui homologue les resultats. Ses pages « calendrier et resultats » sont
 * rendues cote serveur, donc lisibles en une simple requete, contrairement a sa
 * page classement qui est construite dans le navigateur.
 *
 * Bonus. La page affiche aussi les bonus offensif (Bo) et defensif (Bd) par
 * match. C'est precieux : sans eux le classement serait faux de un a deux
 * points par club, puisqu'un bonus vaut un point.
 *
 * Structure d'un bloc, verifiee sur la J3 2026-2027 :
 *
 *   calendar-results__line
 *     club-line__name  -> club qui recoit
 *     [club-special-icon--active : Bo|Bd]      <- bonus du club qui recoit
 *     match-line__score : "23 - 29"
 *     [club-special-icon--active : Bo|Bd]      <- bonus du club visiteur
 *     club-line__name  -> club visiteur
 *
 * On n'utilise donc pas les noms de classes pour attribuer un bonus, mais la
 * position du badge par rapport au score : avant, il est au recevant ; apres,
 * au visiteur. C'est plus court a lire et ca resiste a un renommage de classe.
 */

const axios = require('axios');

const BASE = process.env.LNR_BASE || 'https://top14.lnr.fr';
const SEASON = process.env.LNR_SEASON || '2026-2027';
const TIMEOUT = 15000;

/**
 * Le slug d'URL est l'identifiant stable : il ne bouge pas quand la LNR change
 * un libelle. On mappe donc sur lui, vers les noms tels qu'ils existent dans
 * notre base.
 */
const SLUG_TO_NAME = {
  bayonne: 'Aviron Bayonnais',
  'bordeaux-begles': 'Union Bordeaux-Bègles',
  castres: 'Castres Olympique',
  clermont: 'ASM Clermont',
  'la-rochelle': 'Stade Rochelais',
  lyon: 'LOU Rugby',
  montpellier: 'Montpellier HR',
  paris: 'Stade Français Paris',
  pau: 'Section Paloise',
  perpignan: 'USA Perpignan',
  'racing-92': 'Racing 92',
  toulon: 'RC Toulon',
  toulouse: 'Stade Toulousain',
  vannes: 'RC Vannes',
};

const RE_BLOCK = /class="calendar-results__line"/g;
const RE_CLUB = /href="[^"]*\/club\/([a-z0-9-]+)"[^>]*>\s*([^<]+?)\s*<\/a>/g;
const RE_SCORE = /match-line__score"[^>]*>\s*(\d+)\s*-\s*(\d+)\s*</;
const RE_SHEET = /feuille-de-match\/[^/]+\/j(\d+)\/(\d+)-([a-z0-9-]+)/;
const RE_BADGE = /club-special-icon--active'?"?>\s*(Bo|Bd)\s*</g;
const RE_DATE = /calendar-results__fixture-date[^>]*>\s*([^<]+?)\s*</g;

const MOIS = {
  janvier: 0, 'février': 1, fevrier: 1, mars: 2, avril: 3, mai: 4, juin: 5,
  juillet: 6, 'août': 7, aout: 7, septembre: 8, octobre: 9, novembre: 10, 'décembre': 11, decembre: 11,
};

/**
 * « samedi 19 septembre » -> Date. L'annee n'est pas ecrite sur la page : on la
 * deduit de la saison, aout a decembre pour la premiere annee, janvier a
 * juillet pour la seconde.
 */
function parseJour(libelle) {
  const m = /(\d{1,2})\s+([a-zéûôA-Z]+)/.exec(libelle || '');
  if (!m) return null;
  const mois = MOIS[m[2].toLowerCase()];
  if (mois === undefined) return null;
  const [a1, a2] = SEASON.split('-').map(Number);
  const annee = mois >= 7 ? a1 : a2;
  const d = new Date(Date.UTC(annee, mois, Number(m[1])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Les dates sont des intertitres places avant les rencontres du jour : on les
 * releve avec leur position pour rattacher chaque bloc au dernier intertitre
 * qui le precede.
 */
function decouper(html) {
  const dates = [];
  let m;
  RE_DATE.lastIndex = 0;
  while ((m = RE_DATE.exec(html))) dates.push({ pos: m.index, jour: parseJour(m[1]) });

  const bornes = [];
  RE_BLOCK.lastIndex = 0;
  while ((m = RE_BLOCK.exec(html))) bornes.push(m.index);

  return bornes.map((d, i) => ({
    html: html.slice(d, bornes[i + 1] ?? d + 8000),
    jour: [...dates].reverse().find((x) => x.pos < d)?.jour ?? null,
  }));
}

function analyserBloc({ html: bloc, jour }) {
  const clubs = [];
  RE_CLUB.lastIndex = 0;
  let m;
  while ((m = RE_CLUB.exec(bloc))) clubs.push({ slug: m[1], pos: m.index });
  if (clubs.length < 2) return null;

  const score = RE_SCORE.exec(bloc);
  const sheet = RE_SHEET.exec(bloc);

  // Sans score chiffre, la rencontre n'est pas jouee : on la renvoie quand
  // meme, pour que l'appelant sache qu'elle existe et ne croie pas a un
  // analyseur casse.
  const posScore = score ? score.index : bloc.length;

  const bonus = { home: { o: false, d: false }, away: { o: false, d: false } };
  RE_BADGE.lastIndex = 0;
  while ((m = RE_BADGE.exec(bloc))) {
    const cote = m.index < posScore ? bonus.home : bonus.away;
    if (m[1] === 'Bo') cote.o = true;
    else cote.d = true;
  }

  const [dom, ext] = clubs;

  // Un score affiche pendant la rencontre n'est pas un score homologue. On ne
  // declare « termine » qu'a partir du lendemain ; le reste du temps on laisse
  // l'orchestrateur trancher a l'heure, comme il le fait deja pour les autres
  // sources.
  const finJour = jour ? new Date(jour.getTime() + 36 * 3600 * 1000) : null;
  const final = !score ? false : finJour ? Date.now() > finJour.getTime() : null;

  return {
    jour,
    final,
    round: sheet ? Number(sheet[1]) : null,
    matchId: sheet ? Number(sheet[2]) : null,
    homeSlug: dom.slug,
    awaySlug: ext.slug,
    homeTeam: SLUG_TO_NAME[dom.slug] || dom.slug,
    awayTeam: SLUG_TO_NAME[ext.slug] || ext.slug,
    homeScore: score ? Number(score[1]) : null,
    awayScore: score ? Number(score[2]) : null,
    played: !!score,
    bonus,
    source: 'lnr',
  };
}

/** Analyse une page « calendrier et resultats » d'une journee. */
function parseRound(html) {
  const matchs = decouper(html).map(analyserBloc).filter(Boolean);
  const inconnus = matchs.flatMap((x) =>
    [x.homeSlug, x.awaySlug].filter((s) => !SLUG_TO_NAME[s])
  );
  return { matchs, inconnus: [...new Set(inconnus)] };
}

/**
 * Lit une journee. Le garde-fou est volontairement strict : mieux vaut une
 * erreur bruyante qu'une ecriture partielle. C'est precisement ce qui a
 * manque a la source precedente, qui echouait en silence depuis quatre jours
 * pendant que l'application servait un instantane perime.
 */
async function fetchRound(round, { minMatches = 7 } = {}) {
  const url = `${BASE}/calendrier-et-resultats/${SEASON}/j${round}`;
  const res = await axios.get(url, {
    timeout: TIMEOUT,
    headers: { 'User-Agent': 'top14-pronostics/1.0 (usage prive)' },
  });

  const { matchs, inconnus } = parseRound(String(res.data));

  if (matchs.length < minMatches) {
    throw new Error(
      `LNR J${round} : ${matchs.length} rencontres reconnues sur ${minMatches} attendues — ` +
        `la page a probablement change de structure, rien n'a ete ecrit`
    );
  }
  if (inconnus.length) {
    throw new Error(`LNR J${round} : clubs inconnus ${inconnus.join(', ')} — mapping a completer`);
  }

  return matchs.map((x) => ({ ...x, round: x.round ?? round, url }));
}

/**
 * Forme attendue par results-sync.service : la meme que thesportsdb et espn,
 * pour que la LNR s'ajoute a l'arbitrage sans rien changer a l'orchestrateur.
 * L'identifiant externe est le numero de feuille de match, qui est stable.
 *
 * `kickoff` reste nul : la page ne donne que le jour, pas l'heure, et une date
 * a minuit ecraserait des horaires corrects. Les autres sources gardent donc
 * la main sur l'horaire.
 */
function normalize(x) {
  return {
    source: 'lnr',
    externalId: x.matchId != null ? String(x.matchId) : `${x.round}-${x.homeSlug}-${x.awaySlug}`,
    home: x.homeTeam,
    away: x.awayTeam,
    homeScore: x.homeScore,
    awayScore: x.awayScore,
    final: x.final,
    rawStatus: x.played ? 'SCORE_LNR' : 'A_VENIR',
    kickoff: null,
    round: x.round,
    bonus: x.bonus,
    jour: x.jour,
  };
}

module.exports = { fetchRound, parseRound, normalize, parseJour, SLUG_TO_NAME, SEASON };
