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
  [/aviva/i, 'IRE'],
  [/croke park/i, 'IRE'],
  [/murrayfield/i, 'SCO'],
  [/principality|millennium/i, 'WAL'],
  [/olimpico|flaminio/i, 'ITA'],
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

  if (matchs.length < minMatchs) {
    throw new Error(
      `Six Nations ${annee} : ${matchs.length} rencontres reconnues sur ${minMatchs} attendues — ` +
        `la page a probablement change de structure, rien n'a ete ecrit`
    );
  }

  return { matchs: matchs.map((x) => ({ ...x, url })), anomalies, url };
}

module.exports = {
  fetchSeason, parseSeason, lisible, nationDuStade, NATIONS, STADES, BASE,
};
