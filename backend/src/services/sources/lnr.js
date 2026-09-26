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
 * Horaire et diffuseur. Chaque rencontre porte aussi son heure de coup d'envoi
 * et la ou les chaines qui la diffusent :
 *
 *   <div class="match-line__broadcast-infos">
 *     <p class="match-line__time">14h30</p>
 *     <a class="match-line__broadcaster-link">
 *       <img alt="Canal + Sport" class="match-line__broadcaster" />
 *     </a>
 *   </div>
 *
 * Le nom de la chaine est dans l'attribut `alt` de l'image : c'est la seule
 * forme textuelle disponible, le fichier image ayant un nom instable. On lit
 * la balise entiere puis on en extrait `alt`, pour ne pas dependre de l'ordre
 * des attributs.
 *
 * Structure d'un bloc, verifiee sur les J3 et J4 2026-2027 :
 *
 *   calendar-results__line
 *     club-line__name  -> club qui recoit
 *     [club-special-icon--active : Bo|Bd]      <- bonus du club qui recoit
 *     match-line__score : "23 - 29"
 *     [club-special-icon--active : Bo|Bd]      <- bonus du club visiteur
 *     club-line__name  -> club visiteur
 *     [match-line__broadcast-infos : heure + diffuseurs]
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

// « 14h30 », « 21h05 ». On tolere l'absence de minutes (« 21h »).
const RE_TIME = /match-line__time[^>]*>\s*(\d{1,2})\s*h\s*(\d{2})?\s*</;
// La balise entiere, pour que l'ordre des attributs n'ait pas d'importance.
const RE_BROADCASTER_IMG = /<img[^>]*class="[^"]*match-line__broadcaster[^"]*"[^>]*>/g;
const RE_ALT = /alt="([^"]*)"/;

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
 * Decalage de Paris sur UTC, en minutes, a un instant donne.
 *
 * On ne peut pas le coder en dur : la saison va de septembre a juin et
 * traverse donc deux changements d'heure. Une constante de +2 h avancerait
 * tous les matchs d'hiver d'une heure — et l'heure decide de la cloture des
 * pronostics. On demande donc le decalage reel au systeme.
 */
function offsetParis(instant) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = {};
  for (const part of fmt.formatToParts(new Date(instant))) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  const local = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return (local - instant) / 60000;
}

/**
 * « le 26 septembre a 14h30, heure de Paris » -> instant UTC.
 *
 * Deux passes : la premiere donne un instant approche, dont on lit le decalage
 * reel ; la seconde le corrige. C'est ce qui rend le calcul juste les deux
 * week-ends de changement d'heure, ou le decalage du jour n'est pas celui de
 * l'instant naif.
 */
function parisVersUtc(jour, heures, minutes) {
  const y = jour.getUTCFullYear();
  const mo = jour.getUTCMonth();
  const d = jour.getUTCDate();
  const naif = Date.UTC(y, mo, d, heures, minutes);
  let t = naif - offsetParis(naif) * 60000;
  t = naif - offsetParis(t) * 60000;
  return new Date(t);
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

/**
 * Les chaines d'une rencontre. Une rencontre peut en avoir plusieurs (Canal+ et
 * Canal+ Live sur la J4) : on les garde toutes, dans l'ordre d'affichage, sans
 * doublon.
 */
function lireDiffuseurs(bloc) {
  const noms = [];
  RE_BROADCASTER_IMG.lastIndex = 0;
  let m;
  while ((m = RE_BROADCASTER_IMG.exec(bloc))) {
    const alt = RE_ALT.exec(m[0]);
    const nom = (alt ? alt[1] : '').replace(/\s+/g, ' ').trim();
    if (nom && !noms.includes(nom)) noms.push(nom);
  }
  return noms;
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

  const t = RE_TIME.exec(bloc);
  const heure = t ? `${t[1].padStart(2, '0')}h${t[2] || '00'}` : null;
  const kickoff = t && jour ? parisVersUtc(jour, Number(t[1]), Number(t[2] || 0)) : null;

  const diffuseurs = lireDiffuseurs(bloc);

  // Un score affiche pendant la rencontre n'est pas un score homologue : il
  // faut donc un delai avant de dire « termine ».
  //
  // Ce delai se comptait a partir de minuit du jour du match, faute de mieux :
  // la page ne donnait pas l'heure, et il fallait couvrir aussi bien un match
  // de 14h30 qu'un match de 21h05, d'ou trente-six heures. C'etait large au
  // point d'etre nuisible — les rencontres du samedi restaient « en cours »
  // jusqu'au dimanche apres-midi, et les points des pronostics avec elles.
  //
  // L'heure exacte permet la vraie regle : deux heures trente apres le coup
  // d'envoi, une rencontre de rugby est finie. Le meme seuil que celui de
  // l'orchestrateur, pour que les deux ne se contredisent pas.
  //
  // Le calcul par le jour reste en secours, pour une page qui n'annoncerait
  // pas l'heure.
  const FIN_MS = 2.5 * 3600 * 1000;
  const fin = kickoff
    ? kickoff.getTime() + FIN_MS
    : jour
    ? jour.getTime() + 36 * 3600 * 1000
    : null;
  const final = !score ? false : fin ? Date.now() > fin : null;

  return {
    jour,
    heure,
    kickoff,
    diffuseurs,
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
 * `kickoff` vaut desormais l'heure officielle quand la page la donne, et reste
 * nul sinon — jamais une date a minuit, qui ecraserait un horaire correct par
 * une valeur fausse.
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
    kickoff: x.kickoff || null,
    broadcaster: x.diffuseurs && x.diffuseurs.length ? x.diffuseurs.join(' / ') : null,
    round: x.round,
    bonus: x.bonus,
    jour: x.jour,
  };
}

module.exports = {
  fetchRound, parseRound, normalize, parseJour, parisVersUtc, offsetParis,
  SLUG_TO_NAME, SEASON,
};
