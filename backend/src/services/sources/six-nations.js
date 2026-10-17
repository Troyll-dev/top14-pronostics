/**
 * Source Six Nations — le site officiel du Tournoi.
 *
 * ---------------------------------------------------------------------------
 * POURQUOI CELLE-CI
 * ---------------------------------------------------------------------------
 *
 * Six Nations Rugby organise la competition : c'est, pour le Tournoi, ce que la
 * LNR est au Top 14. La FFR, elle, ne connait que « la France » et « son
 * adversaire » — son modele de donnees ne peut pas representer Angleterre–
 * Ecosse. Elle reste indispensable pour les compositions du XV de France, que
 * personne d'autre ne publie, mais elle ne donnera jamais les quinze
 * rencontres.
 *
 * Et l'adressage est d'une regularite rare : l'annee suivie de deux zeros.
 *
 *     /en/m6n/fixtures/202700      l'edition 2027
 *     /en/m6n/fixtures/202600      l'edition 2026
 *
 * Une requete par edition. Quinze rencontres. Pas de clef d'API, pas de
 * referentiel a tenir a jour, pas de pagination.
 *
 * ---------------------------------------------------------------------------
 * CE QU'ON LIT, ET A QUOI ON S'ACCROCHE
 * ---------------------------------------------------------------------------
 *
 * La page est rendue par le serveur et embarque sa donnee en JSON echappe. Une
 * carte de rencontre ressemble a ceci, une fois les antislashs retires :
 *
 *   "div","2026-02-05",{ …                              <- le jour
 *     "data-testid":"fixture-card", …                   <- la carte
 *       fixturesResultsCard_stadium__eRJIL","children":"Stade de France"
 *       fixturesResultsCard_teamName__M7vfR","children":"FRA"
 *       fixturesResultsCard_teamScore__rv3sW …","children":36
 *       fixturesResultsCard_halfTimeScore__9ViyB … ["HT"," ",22,"-",0]
 *       fixturesResultsCard_teamName__M7vfR","children":"IRE"
 *
 * Une rencontre a venir porte, a la place des scores, son coup d'envoi :
 *
 *       "format":"HH:mm","date":"2027-02-05T20:10:00.000Z"
 *
 * **Les suffixes de classe sont jetables.** `__qdiE7`, `__M7vfR`, `__rv3sW` :
 * ce sont des empreintes generees a la compilation du site, et elles changeront
 * toutes le jour d'une mise a jour. S'y accrocher reviendrait a ecrire un
 * analyseur avec une date de peremption inconnue. On ne retient donc que les
 * prefixes — `fixturesResultsCard_teamName__` — et surtout `data-testid`, qui
 * est pose la exprement pour etre un point d'accroche stable.
 *
 * ---------------------------------------------------------------------------
 * LE GARDE-FOU, ET D'OU IL VIENT
 * ---------------------------------------------------------------------------
 *
 * La premiere equipe de la carte est celle qui recoit. On pourrait s'en tenir
 * a cette observation ; ce serait exactement l'erreur qui a coute six journees
 * de compositions du Top 14 — on y supposait que le premier bloc d'une feuille
 * de match etait le club recevant, et la LNR inversait l'ordre une fois sur
 * deux sans qu'on lise l'attribut qui le disait.
 *
 * Ici, la page donne de quoi verifier : le stade. Un stade appartient a une
 * nation, et cette table ne compte que six lignes. Si la carte annonce
 * l'Aviva Stadium et met l'Ecosse en premier, c'est que l'ordre n'est pas celui
 * qu'on croit — et la rencontre est signalee plutot qu'enregistree de travers.
 *
 * Mieux vaut un manque visible qu'une erreur silencieuse : c'est la lecon de la
 * journee, et elle est ecrite dans le code plutot que dans un commentaire.
 */

const axios = require('axios');

const BASE = process.env.SIX_NATIONS_BASE || 'https://www.sixnationsrugby.com';
const TIMEOUT = 20000;

/** Les six nations, telles que le site les code. */
const NATIONS = {
  FRA: 'France',
  ENG: 'Angleterre',
  IRE: 'Irlande',
  SCO: 'Écosse',
  WAL: 'Pays de Galles',
  ITA: 'Italie',
};

/**
 * A qui appartient un stade.
 *
 * Sert uniquement a verifier que la premiere equipe de la carte est bien celle
 * qui recoit. La table est volontairement tolerante : on compare en minuscules
 * et sans accent, et un stade inconnu ne fait pas echouer la lecture — il prive
 * seulement cette rencontre de sa verification, ce qui est dit dans le
 * resultat.
 *
 * Les clubs changent de nom de stade au gre des sponsors (Twickenham est
 * devenu Allianz Stadium, Murrayfield est « Scottish Gas Murrayfield »). On
 * reconnait donc sur un fragment distinctif, pas sur le nom complet.
 */
const STADES = [
  [/stade de france|saint-denis/i, 'FRA'],
  // La France delocalise regulierement une rencontre du Tournoi — Lille en
  // 2026. Ces enceintes sont en France : y recevoir, c'est recevoir.
  [/pierre.?mauroy|velodrome|v[ée]lodrome|allianz riviera|groupama stadium|matmut atlantique/i, 'FRA'],
  [/aviva/i, 'IRE'],
  [/croke park/i, 'IRE'],
  [/murrayfield/i, 'SCO'],
  [/principality|millennium/i, 'WAL'],
  [/olimpico|flaminio|artemio franchi/i, 'ITA'],
  [/twickenham|allianz stadium/i, 'ENG'],
];

const nationDuStade = (stade) => {
  for (const [re, code] of STADES) if (re.test(String(stade || ''))) return code;
  return null;
};

/**
 * Le JSON embarque est echappe dans le HTML : `\"FRA\"`. On le rend lisible
 * avant toute lecture.
 *
 * Ce n'est pas un detail de confort. Une premiere sonde a cherche `"FRA"` dans
 * le texte brut, n'a rien trouve, et a conclu que la page etait vide alors
 * qu'elle contenait les quinze rencontres.
 */
const lisible = (html) =>
  String(html || '')
    .replace(/\\"/g, '"')
    .replace(/\\u0026/g, '&')
    .replace(/\\n/g, ' ')
    .replace(/\\/g, '')
    .replace(/\s+/g, ' ');

const RE_JOUR = /"div","(\d{4}-\d{2}-\d{2})"/g;
const RE_CARTE = /"data-testid":"fixture-card"/g;
const RE_STADE = /fixturesResultsCard_stadium__[^"]*","children":"([^"]+)"/;
const RE_EQUIPE = /fixturesResultsCard_teamName__[^"]*","children":"([A-Z]{3})"/;
const RE_SCORE = /fixturesResultsCard_teamScore__[^"]*","children":(\d+)/;
const RE_COUP_ENVOI = /"format":"HH:mm","date":"(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)"/;
const RE_MI_TEMPS = /fixturesResultsCard_halfTimeScore__[^"]*"[^[]*\["HT"[^\]]*?(\d+),"-",(\d+)\]/;
const RE_CAMP = /fixturesResultsCard_teamContainer__/g;

/**
 * La marque d'une rencontre terminée.
 *
 * La carte d'un match joué porte, sur son score de mi-temps, la classe
 * `fixturesResultsCard_finished__`. Un score affiché ne suffit pas : pendant le
 * match la carte en montre un aussi, et il change à chaque essai. Attribuer des
 * points sur un score en cours ferait bouger le classement à chaque action.
 * Seule cette marque dit que le score est définitif — même règle que pour la
 * LNR, où un score n'est retenu qu'une fois homologué.
 */
const RE_TERMINE = /fixturesResultsCard_finished__/;

/**
 * Les deux camps d'une carte.
 *
 * On decoupe sur le conteneur d'equipe plutot que de relever les noms puis les
 * scores separement : une liste de noms et une liste de nombres se reapparient
 * mal des qu'un element manque, et c'est silencieux. Chaque camp lu dans sa
 * propre tranche ne peut pas emprunter le score du voisin.
 */
function camps(carte) {
  const bornes = [];
  RE_CAMP.lastIndex = 0;
  let m;
  while ((m = RE_CAMP.exec(carte))) bornes.push(m.index);
  if (bornes.length < 2) return null;

  return bornes.slice(0, 2).map((debut, i) => {
    const tranche = carte.slice(debut, bornes[i + 1] ?? carte.length);
    const eq = RE_EQUIPE.exec(tranche);
    const sc = RE_SCORE.exec(tranche);
    return {
      code: eq ? eq[1] : null,
      nom: eq ? NATIONS[eq[1]] || eq[1] : null,
      score: sc ? Number(sc[1]) : null,
    };
  });
}

/**
 * Analyse une page « fixtures » d'une edition.
 *
 * Rend `{ matchs, anomalies }`. Une anomalie n'interrompt rien : elle nomme une
 * carte qu'on n'a pas su lire, ou dont l'ordre des camps contredit le stade.
 * L'appelant decide quoi en faire — et doit refuser d'ecrire une rencontre
 * signalee, plutot que de l'enregistrer en esperant.
 */
function parseSeason(html, { annee = null } = {}) {
  const clair = lisible(html);
  const anomalies = [];

  // Les jours sont des intertitres : on les releve avec leur position pour
  // rattacher chaque carte au dernier qui la precede.
  const jours = [];
  RE_JOUR.lastIndex = 0;
  let m;
  while ((m = RE_JOUR.exec(clair))) jours.push({ pos: m.index, jour: m[1] });

  const debuts = [];
  RE_CARTE.lastIndex = 0;
  while ((m = RE_CARTE.exec(clair))) debuts.push(m.index);

  const matchs = [];

  debuts.forEach((debut, i) => {
    const carte = clair.slice(debut, debuts[i + 1] ?? debut + 6000);
    const jour = [...jours].reverse().find((j) => j.pos < debut)?.jour || null;

    const stade = RE_STADE.exec(carte)?.[1] || null;
    const deux = camps(carte);

    if (!deux || !deux[0].code || !deux[1].code) {
      anomalies.push(`carte ${i + 1}${jour ? ` du ${jour}` : ''} : equipes illisibles`);
      return;
    }

    const [dom, ext] = deux;
    const coup = RE_COUP_ENVOI.exec(carte)?.[1] || null;
    const ht = RE_MI_TEMPS.exec(carte);

    /*
     * Le garde-fou : le stade doit appartenir au premier camp.
     *
     * On signale, on n'inverse pas. Inverser serait deviner, et une inversion
     * automatique masquerait justement le jour ou le site changerait d'ordre —
     * exactement ce qui s'est produit avec les compositions du Top 14.
     */
    const proprietaire = nationDuStade(stade);
    const ordreVerifie = proprietaire !== null;
    if (ordreVerifie && proprietaire !== dom.code) {
      anomalies.push(
        `${jour || '?'} ${dom.code}–${ext.code} : le stade « ${stade} » est celui de ` +
        `${proprietaire}, qui n'est pas le premier camp — ordre suspect`
      );
    }

    matchs.push({
      source: 'six-nations',
      annee,
      jour,
      // Le coup d'envoi n'existe que tant que la rencontre est a venir : une
      // fois jouee, la page remplace l'heure par le score. On garde donc null
      // plutot qu'une heure inventee — la date du jour reste connue, et
      // l'horaire aura ete collecte avant le match.
      kickoff: coup ? new Date(coup) : null,
      stade,
      home: dom.code,
      away: ext.code,
      homeNom: dom.nom,
      awayNom: ext.nom,
      homeScore: dom.score,
      awayScore: ext.score,
      miTemps: ht ? { home: Number(ht[1]), away: Number(ht[2]) } : null,
      joue: dom.score !== null && ext.score !== null,
      termine: dom.score !== null && ext.score !== null && RE_TERMINE.test(carte),
      ordreVerifie,
    });
  });

  return { matchs, anomalies };
}

/**
 * Lit une edition. Le garde-fou est strict, comme pour la LNR : mieux vaut une
 * erreur bruyante qu'une collecte a moitie.
 *
 * Quinze rencontres, toujours : six nations qui en jouent cinq chacune. Un
 * compte different signale une page qui a change de structure, et il vaut mieux
 * l'apprendre par une exception que par un calendrier a trous.
 */
async function fetchSeason(annee, { minMatchs = 15 } = {}) {
  const saison = `${annee}00`;
  const url = `${BASE}/en/m6n/fixtures/${saison}`;

  const res = await axios.get(url, {
    timeout: TIMEOUT,
    headers: {
      'User-Agent': 'top14-pronostics/1.0 (usage prive)',
      'Accept-Language': 'en;q=0.9',
    },
    maxContentLength: 30 * 1024 * 1024,
  });

  const { matchs, anomalies } = parseSeason(String(res.data), { annee });
  const rapports = liensRapports(String(res.data), saison);

  if (matchs.length < minMatchs) {
    throw new Error(
      `Six Nations ${annee} : ${matchs.length} rencontres reconnues sur ${minMatchs} attendues — ` +
        `la page a probablement change de structure, rien n'a ete ecrit`
    );
  }

  return {
    matchs: matchs.map((x) => ({ ...x, url, rapport: rapports[`${x.home}-${x.away}`] || null })),
    anomalies,
    url,
  };
}

// ---------------------------------------------------------------------------
// LES PAGES « REPORT » : LES ESSAIS DE CHAQUE MATCH
// ---------------------------------------------------------------------------
//
// Le classement du Tournoi compte des bonus, et le bonus offensif dépend du
// nombre d'essais — que la carte d'une rencontre ne donne pas. Le site publie
// bien un classement, mais il le charge dans le navigateur depuis une API que
// la page ne montre pas : rien à lire côté serveur.
//
// Chaque match joué a en revanche sa page « report », rendue par le serveur,
// avec la liste des points marqués de chaque camp : essais, transformations,
// pénalités, drops, minute par minute. C'est là qu'on lit les essais.

/** Les noms anglais des adresses du site, vers les codes de ses cartes. */
const PAR_NOM_ANGLAIS = {
  france: 'FRA', england: 'ENG', ireland: 'IRE', scotland: 'SCO', wales: 'WAL', italy: 'ITA',
};

/**
 * Les adresses des pages « report » d'une édition, rangées par affiche.
 *
 * La page des matchs renvoie vers chaque rencontre par une adresse lisible :
 * `/en/m6n/fixtures/202600/france-v-england-14032026-2110`. Le nom qui précède
 * « -v- » est celui qui reçoit — c'est l'ordre de la carte, et le stade le
 * vérifie déjà. On rend `{ 'FRA-ENG': '/en/m6n/fixtures/202600/…/report' }`.
 */
function liensRapports(html, saison) {
  const clair = lisible(html);
  const re = new RegExp(`/en/m6n/fixtures/${saison}/([a-z]+)-v-([a-z]+)-(\\d{8})-(\\d{4})`, 'g');
  const sortie = {};
  let m;
  while ((m = re.exec(clair))) {
    const dom = PAR_NOM_ANGLAIS[m[1]];
    const ext = PAR_NOM_ANGLAIS[m[2]];
    if (!dom || !ext) continue;
    sortie[`${dom}-${ext}`] = `/en/m6n/fixtures/${saison}/${m[1]}-v-${m[2]}-${m[3]}-${m[4]}/report`;
  }
  return sortie;
}

/**
 * L'objet JSON qui commence à `debut` (une accolade ouvrante), lu en comptant
 * les accolades hors des chaînes. Rend `null` si l'objet est mal formé.
 */
function objetA(texte, debut) {
  let prof = 0;
  let chaine = false;
  for (let i = debut; i < texte.length; i++) {
    const c = texte[i];
    if (chaine) {
      if (c === '"') chaine = false;
      continue;
    }
    if (c === '"') chaine = true;
    else if (c === '{') prof++;
    else if (c === '}') {
      prof--;
      if (prof === 0) {
        try { return JSON.parse(texte.slice(debut, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

/** Ce qu'un camp a marqué, compté sur sa liste de buteurs. */
function compter(camp) {
  const c = { score: camp.score, essais: 0, essaisPenalite: 0, transformations: 0, penalites: 0, drops: 0 };
  for (const b of camp.scorers || []) {
    const n = Array.isArray(b.scoreTimes) && b.scoreTimes.length ? b.scoreTimes.length : 1;
    const type = String(b.scoreType || '');
    if (/^try$/i.test(type)) {
      c.essais += n;
      // Un essai sans joueur est un essai de pénalité : il vaut sept points
      // d'un coup, sans transformation à tenter.
      if (!b.playerId) c.essaisPenalite += n;
    } else if (/conversion/i.test(type)) c.transformations += n;
    else if (/penalty/i.test(type)) c.penalites += n;
    else if (/drop/i.test(type)) c.drops += n;
  }
  return c;
}

/**
 * Les points marqués redonnent-ils le score ?
 *
 * C'est le garde-fou de cette lecture, et il est arithmétique : cinq points
 * l'essai, deux la transformation, trois la pénalité ou le drop. Un essai de
 * pénalité vaut sept ; selon la façon dont le site le range, il peut compter
 * pour un essai seul ou pour un essai et sa transformation.
 *
 * **Une transformation peut manquer, un essai non.** Le site oublie parfois
 * la dernière transformation d'un match : sur France–Irlande 2026, l'essai
 * d'Attissogbe à la 80e est bien là, la transformation de Ramos qui suit
 * n'apparaît ni dans les buteurs ni dans la chronologie — 34 points relevés
 * pour un score de 36. Or le classement n'a besoin que des essais : une
 * transformation absente ne change rien au bonus. On l'accepte donc, et
 * seulement elle : un écart pair, pas plus grand que le nombre d'essais non
 * transformés. Un essai ou une pénalité manquants donnent un écart impair (5,
 * 7, 3) et restent refusés.
 *
 * Rend `{ ok, transformationsManquantes }`.
 */
function concorde(c) {
  const base = 5 * c.essais + 2 * c.transformations + 3 * (c.penalites + c.drops);
  if (c.score === base || c.score === base + 2 * c.essaisPenalite) {
    return { ok: true, transformationsManquantes: 0 };
  }
  const ecart = c.score - base;
  const nonTransformes = c.essais - c.transformations;
  if (ecart > 0 && ecart % 2 === 0 && ecart / 2 <= nonTransformes) {
    return { ok: true, transformationsManquantes: ecart / 2 };
  }
  return { ok: false, transformationsManquantes: 0 };
}

/**
 * Analyse une page « report ». Rend `{ home, away }`, chacun avec son score et
 * son décompte, ou lève une erreur qui dit ce qui ne va pas.
 */
function parseRapport(html) {
  const clair = lisible(html);
  const re = /"componentProps":\{"(?:home|away)":\{"score":/g;
  let m;
  while ((m = re.exec(clair))) {
    const debut = clair.indexOf('{', m.index + '"componentProps":'.length);
    const obj = objetA(clair, debut);
    if (!obj?.home?.scorers || !obj?.away?.scorers) continue;
    const home = compter(obj.home);
    const away = compter(obj.away);
    for (const [cote, c] of [['domicile', home], ['extérieur', away]]) {
      const v = concorde(c);
      c.transformationsManquantes = v.transformationsManquantes;
      if (!v.ok) {
        throw new Error(
          `buteurs incomplets côté ${cote} : ${c.essais} E, ${c.transformations} T, ` +
          `${c.penalites} P, ${c.drops} D ne font pas ${c.score}`
        );
      }
    }
    return { home, away };
  }
  throw new Error('aucune liste de buteurs dans la page');
}

async function fetchRapport(chemin) {
  const res = await axios.get(BASE + chemin, {
    timeout: TIMEOUT,
    headers: {
      'User-Agent': 'top14-pronostics/1.0 (usage prive)',
      'Accept-Language': 'en;q=0.9',
    },
    maxContentLength: 30 * 1024 * 1024,
  });
  return parseRapport(String(res.data));
}

module.exports = {
  fetchSeason, parseSeason, lisible, nationDuStade, NATIONS, STADES, BASE,
  liensRapports, parseRapport, fetchRapport, compter, concorde,
};
