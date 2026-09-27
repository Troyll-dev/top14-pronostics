/**
 * Les statistiques d'une rencontre, lues sur la feuille de match de la LNR.
 *
 * Ce que ca sert. Prise seule, cette page est un debrief : elle n'existe
 * qu'apres le coup de sifflet final et ne dit rien du match a venir. Cumulee
 * journee apres journee, elle devient exactement ce qui manquait aux
 * pronostics — combien d'essais un club marque et encaisse en moyenne, combien
 * de penalites il concede, combien de plaquages il manque. Un classement dit
 * qui gagne ; ces chiffres-la disent a peu pres de combien.
 *
 * D'ou la regle de ce fichier : il lit un match, et rien de plus. Le cumul par
 * club vit dans `team-stats.service.js`, et il se recalcule a chaque fois a
 * partir des matchs enregistres — un total qu'on incremente finit toujours par
 * se desynchroniser du detail, et personne ne s'en apercoit avant la fin de
 * saison.
 *
 * Structure, relevee sur RC Toulon - RC Vannes (J4, 2026-2027). Chaque
 * statistique est un bloc identique, quel que soit le groupe qui la contient :
 *
 *   <div class="stats-bar">
 *     <div class="stats-bar__title">Essais accordés</div>
 *     <div class="stats-bar__val stats-bar__val--left">4</div>
 *     ... la barre de progression ...
 *     <div class="stats-bar__val stats-bar__val--right">1</div>
 *
 * Les cartons font exception : ils vivent dans deux blocs
 * `match-statistics__cards-team`, recevant puis visiteur, chacun portant trois
 * pastilles distinguees par leur classe (`--yellow`, `--orange`, `--red`).
 *
 * Deux pieges, tous les deux verifies par des tests.
 *
 * Le nom des clubs. La page contient **deux** `<switcher-buttons>` : le premier
 * commande l'onglet et annonce `home-team="Match" away-team="Joueurs"`, le
 * second seulement porte les vrais noms. Lire le premier ferait croire que le
 * recevant s'appelle « Match » — et comme le service compare ce nom a celui de
 * la base pour refuser d'ecrire une statistique inversee, ce garde-fou se serait
 * declenche a tous les matchs.
 *
 * Et les pourcentages s'ecrivent « 50 % », avec une espace. On ne lit donc que
 * les chiffres, et on garde le signe a part.
 */

const axios = require('axios');

const BASE = process.env.LNR_BASE || 'https://top14.lnr.fr';
const TIMEOUT = 15000;

const SEP_BAR = '<div class="stats-bar">';
const RE_TITRE = /stats-bar__title"[^>]*>\s*([^<]+?)\s*</;
const RE_GAUCHE = /stats-bar__val--left"[^>]*>\s*([\d.,]+)\s*(%?)/;
const RE_DROITE = /stats-bar__val--right"[^>]*>\s*([\d.,]+)\s*(%?)/;

const RE_CARTONS_EQUIPE = /match-statistics__cards-team">([\s\S]*?)(?=match-statistics__cards-team"|match-statistics__group|$)/g;
const RE_CARTON = /stats-cards-fault--(yellow|orange|red)"[\s\S]{0,300}?stats-cards-fault__card">\s*(\d+)\s*</g;

const RE_SWITCHER = /<switcher-buttons\b[\s\S]{0,300}?>/g;
const RE_HOME_ATTR = /home-team="([^"]*)"/;
const RE_AWAY_ATTR = /away-team="([^"]*)"/;

/** Les clefs dont le cumul se sert. Le reste est garde sans etre interprete. */
const ESSAIS = 'essais_accordes';
const PENALITES_CONCEDEES = 'penalites_concedees';
const PLAQUAGES_MANQUES = 'plaquages_manques';
const POSSESSION = 'possession_de_la_balle';
const OCCUPATION = 'occupation';
const EN_AVANT = 'en_avant_commis';

/**
 * « Pénalités concédées » -> `penalites_concedees`.
 *
 * On slugifie au lieu de tenir une table de correspondance : la LNR publie une
 * vingtaine de statistiques et en ajoutera d'autres. Une table obligerait a
 * livrer une version du code pour lire « ballons grattes » ; la slugification
 * les enregistre toutes d'office, et seules celles qui servent au cumul ont un
 * nom dans ce fichier.
 */
function clef(titre) {
  return String(titre || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const nombre = (txt) => {
  const n = Number(String(txt).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/**
 * Le couple recevant / visiteur de chaque statistique, par clef.
 *
 * On decoupe sur l'ouverture des blocs plutot que de les capturer d'un seul
 * motif : une expression qui doit deviner ou s'arrete un bloc se trompe des que
 * la LNR glisse autre chose au milieu d'un groupe — ce qu'elle fait deja avec
 * les cartons, poses entre deux barres de la rubrique « Fautes ». Lire chaque
 * tranche separement rend cette question sans objet.
 */
function lireBarres(html) {
  const barres = {};
  const tranches = String(html).split(SEP_BAR).slice(1);

  for (const bloc of tranches) {
    const t = RE_TITRE.exec(bloc);
    if (!t) continue;
    const g = RE_GAUCHE.exec(bloc);
    const d = RE_DROITE.exec(bloc);
    if (!g || !d) continue;

    const k = clef(t[1]);
    if (!k || barres[k]) continue;   // premiere occurrence seulement
    barres[k] = {
      titre: t[1],
      home: nombre(g[1]),
      away: nombre(d[1]),
      pourcent: g[2] === '%' || d[2] === '%',
    };
  }
  return barres;
}

/** Les cartons des deux camps, dans l'ordre de la page. */
function lireCartons(html) {
  const cotes = [];
  RE_CARTONS_EQUIPE.lastIndex = 0;
  let m;
  while ((m = RE_CARTONS_EQUIPE.exec(html))) {
    const bloc = m[1];
    const c = { jaune: 0, orange: 0, rouge: 0 };
    RE_CARTON.lastIndex = 0;
    let n;
    while ((n = RE_CARTON.exec(bloc))) {
      const v = Number(n[2]) || 0;
      if (n[1] === 'yellow') c.jaune = v;
      else if (n[1] === 'orange') c.orange = v;
      else c.rouge = v;
    }
    cotes.push(c);
  }
  return {
    home: cotes[0] || { jaune: 0, orange: 0, rouge: 0 },
    away: cotes[1] || { jaune: 0, orange: 0, rouge: 0 },
  };
}

/**
 * Les noms de clubs, pris sur le `switcher-buttons` qui en porte de vrais.
 *
 * Le premier de la page commande l'onglet et annonce « Match » et « Joueurs ».
 * On saute donc tout couple qui ressemble a une commande d'affichage plutot
 * qu'a deux clubs.
 */
function lireClubs(html) {
  RE_SWITCHER.lastIndex = 0;
  let m;
  while ((m = RE_SWITCHER.exec(html))) {
    const home = RE_HOME_ATTR.exec(m[0])?.[1];
    const away = RE_AWAY_ATTR.exec(m[0])?.[1];
    if (!home || !away) continue;
    if (/^(match|joueurs)$/i.test(home) || /^(match|joueurs)$/i.test(away)) continue;
    return { homeTeam: home, awayTeam: away };
  }
  return { homeTeam: null, awayTeam: null };
}

/**
 * Analyse une page « statistiques du match ».
 *
 * Rend toujours un objet. `complete` dit si la page porte bien les essais, la
 * seule statistique dont le cumul ne peut pas se passer : avant le coup d'envoi
 * la page existe et ne contient aucune barre, ce qui est normal et ne doit pas
 * lever.
 */
function parseStats(html) {
  const page = String(html || '');
  const { homeTeam, awayTeam } = lireClubs(page);
  const barres = lireBarres(page);

  return {
    homeTeam,
    awayTeam,
    barres,
    cartons: lireCartons(page),
    complete: !!barres[ESSAIS],
  };
}

/** L'URL de l'onglet statistiques, a partir du chemin de feuille de match. */
function urlStats(sheetPath) {
  if (!sheetPath) return null;
  const chemin = String(sheetPath).replace(/^\/+/, '').replace(/\/+$/, '');
  return `${BASE}/${chemin}/statistiques-du-match`;
}

/** Lit les statistiques d'une rencontre. Leve sur une erreur reseau seulement. */
async function fetchStats(sheetPath) {
  const url = urlStats(sheetPath);
  if (!url) throw new Error('chemin de feuille de match manquant');

  const res = await axios.get(url, {
    timeout: TIMEOUT,
    headers: { 'User-Agent': 'top14-pronostics/1.0 (usage prive)' },
  });

  return { ...parseStats(String(res.data)), url };
}

module.exports = {
  parseStats, fetchStats, urlStats, clef,
  ESSAIS, PENALITES_CONCEDEES, PLAQUAGES_MANQUES, POSSESSION, OCCUPATION, EN_AVANT,
};
