/**
 * Les compositions d'equipe, lues sur la feuille de match de la LNR.
 *
 * Pourquoi c'est utile pour des pronostics. Un quinze de depart dit souvent
 * plus qu'un classement : un club qui laisse ses internationaux au repos la
 * semaine d'une coupe d'Europe, un buteur remplacant, un pilier titulaire
 * absent — ce sont ces informations-la qui font changer d'avis sur un score.
 * Elles paraissent le jeudi ou le vendredi, c'est-a-dire pendant la fenetre ou
 * les joueurs pronostiquent.
 *
 * Ou ca se trouve. Chaque rencontre a une feuille de match a trois onglets, et
 * seul le deuxieme porte les compositions :
 *
 *   /feuille-de-match/2026-2027/j4/11845-toulon-vannes                  <- resumes
 *   /feuille-de-match/2026-2027/j4/11845-toulon-vannes/compositions     <- ici
 *   /feuille-de-match/2026-2027/j4/11845-toulon-vannes/statistiques-du-match
 *
 * Comme le calendrier, cette page est rendue par le serveur : une requete
 * suffit, pas de navigateur. Le chemin de la feuille est deja present dans le
 * calendrier, d'ou `sheetPath` cote `lnr.js` — on ne reconstruit pas une URL a
 * la main, on suit le lien que la page nous donne.
 *
 * Structure, relevee sur RC Toulon - RC Vannes (J4, 2026-2027) :
 *
 *   <line-up-pitch home-team="RC Toulon" away-team="RC Vannes">   <- les deux camps
 *     ... player-pitch : le quinze de depart dessine sur le terrain
 *   <div class="line-up__classic-team">                           <- une equipe
 *     <h3 class="line-up__classic-title">XV de départ</h3>
 *       <a class="player-block player-block--lineup">             x15
 *     <h3 class="line-up__classic-title">Remplaçants</h3>
 *       <a class="player-block player-block--lineup">             x8
 *   <div class="line-up__classic-team">                           <- l'autre
 *   <div class="line-up__classic-team line-up__classic-team--officials">
 *
 * ---------------------------------------------------------------------------
 * L'ATTRIBUT QUI DECIDE DE L'ORDRE — ET QUI A COUTE SIX JOURNEES
 * ---------------------------------------------------------------------------
 *
 * Les deux blocs d'equipe ne se nomment pas. Aucun nom de club, aucun slug,
 * aucun ecusson : rien que « XV de départ » suivi de quinze joueurs. Leur
 * appartenance tient donc entierement a leur ordre, et cet ordre **n'est pas
 * toujours le meme**.
 *
 *   <line-up-pitch home-team="LOU Rugby" away-team="Stade Rochelais"
 *                  visiting-first>              <- le VISITEUR est ecrit en premier
 *
 *   <line-up-pitch home-team="Section Paloise" away-team="Castres Olympique">
 *                                               <- le recevant est en premier
 *
 * Cette version lisait toujours le premier bloc comme le recevant. Elle avait
 * donc raison quand l'attribut est absent, et tort quand il est la — soit une
 * rencontre sur deux environ, sans regularite visible. Les compositions des six
 * premieres journees sont en base avec les deux camps intervertis une fois sur
 * deux, et personne ne s'en est apercu : il aurait fallu reconnaitre quarante-
 * six joueurs de memoire. C'est un compteur de rotation, ecrit pour tout autre
 * chose, qui a fini par le reveler en annoncant que tous les clubs changeaient
 * quinze titulaires chaque semaine.
 *
 * Deux lecons dans le code ci-dessous. D'abord on lit l'attribut au lieu de
 * supposer l'ordre. Ensuite, et surtout, **une feuille dont on ne sait pas lire
 * l'en-tete n'est plus exploitable** : sans en-tete, on ignore l'ordre, donc on
 * ignore a qui appartient chaque quinze, et une composition qu'on ne sait pas
 * attribuer ne vaut rien. Mieux vaut une absence franche qu'une inversion
 * silencieuse — c'est la difference entre « on ne sait pas » et « on se
 * trompe », et seule la seconde trompe les joueurs.
 *
 * ---------------------------------------------------------------------------
 *
 * Deux details qui decident du reste de l'analyseur.
 *
 * Le bloc dessine sur le terrain ne porte que le quinze de depart : il ignore
 * les remplacants, qui sont precisement ceux dont on veut savoir s'ils sont la.
 * On lit donc la liste « classique », pas le terrain.
 *
 * Et les officiels de match habitent un bloc de meme classe que les deux
 * equipes. Il porte un suffixe `--officials`, mais surtout ses fiches sont des
 * `<div>` et non des `<a>` : en ne relevant que les liens vers `/joueur/`, on
 * ne peut pas prendre un arbitre pour un pilier. Le suffixe sert quand meme, a
 * ne pas compter ce bloc comme une troisieme equipe.
 *
 * Un dernier avertissement, tire des donnees elles-memes : le libelle de poste
 * de la LNR est parfois faux — Mathis Ferte porte le 11 et se voit annonce
 * « Demi de mêlée ». Le numero de maillot, lui, est juste. C'est donc lui qui
 * fait foi a l'affichage, et le libelle n'est qu'une indication.
 */

const axios = require('axios');

const BASE = process.env.LNR_BASE || 'https://top14.lnr.fr';
const TIMEOUT = 15000;

/** Un quinze complet, plus le banc. En deca, la page n'est pas encore remplie. */
const MIN_TITULAIRES = 15;

const RE_TEAM = /class="line-up__classic-team([^"]*)"/g;
const RE_TITRE = /line-up__classic-title[^>]*>\s*([^<]+?)\s*</g;
const RE_JOUEUR = /<a\s+href="[^"]*\/joueur\/(\d+)-[^"]*"\s+class="([^"]*)"/g;
const RE_NUMERO = /player-block__number"[^>]*>\s*(\d+)\s*</;
const RE_NOM = /player-block__name"[^>]*>\s*([^<]+?)\s*</;
const RE_POSTE = /player-block__position"[^>]*>\s*([^<]+?)\s*</;

/*
 * La balise d'en-tete, jusqu'a son chevron fermant.
 *
 * La borne est passee de 400 a 1200 caracteres. Les trois attributs tiennent
 * largement dans 400, mais c'est exactement le genre de limite qui laisse
 * tomber un attribut le jour ou la LNR en ajoute un — et cette balise porte
 * desormais l'information qui decide de l'attribution des quinze. Une borne
 * reste necessaire pour ne pas devorer la page entiere si le chevron manque.
 */
const RE_PITCH = /<line-up-pitch\b[\s\S]{0,1200}?>/;
const RE_HOME_ATTR = /home-team="([^"]*)"/;
const RE_AWAY_ATTR = /away-team="([^"]*)"/;

/**
 * L'attribut qui inverse l'ordre des deux blocs.
 *
 * C'est un attribut booleen : il est present ou il ne l'est pas, sans valeur.
 * On exige donc une frontiere de mot de chaque cote, pour qu'un futur
 * `data-visiting-first-something` ne le declenche pas par accident.
 */
const RE_VISITEUR_DABORD = /(^|[\s"'])visiting-first([\s=>"'/]|$)/;

const RE_OFFICIEL = /player-block__name"[^>]*>\s*([^<]+?)\s*<[\s\S]{0,400}?player-block__position"[^>]*>\s*([^<]+?)\s*</g;

const ENTITES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' };

/**
 * Les noms arrivent encodes, et deux fois pour certains : `K&amp;#039;POKU`
 * dans un attribut, `K&#039;POKU` dans le texte. On decode donc jusqu'a
 * stabilisation, avec une borne pour ne pas boucler sur une entree hostile.
 */
function decode(txt) {
  let out = String(txt || '');
  for (let i = 0; i < 3; i++) {
    const avant = out;
    out = out
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
      .replace(/&([a-z]+);/gi, (m, n) => (ENTITES[n.toLowerCase()] !== undefined ? ENTITES[n.toLowerCase()] : m));
    if (out === avant) break;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** « Remplaçants » -> 'remplacants' ; « XV de départ » -> 'titulaires'. */
function groupe(titre) {
  const t = decode(titre).toLowerCase();
  if (/rempla/.test(t)) return 'remplacants';
  if (/xv|départ|depart/.test(t)) return 'titulaires';
  return null;
}

/** Les bornes des blocs d'equipe, officiels compris, dans l'ordre de la page. */
function blocs(html) {
  const marques = [];
  RE_TEAM.lastIndex = 0;
  let m;
  while ((m = RE_TEAM.exec(html))) {
    // « line-up__classic-team line-up__classic-team--officials » declenche deux
    // fois la meme expression : on ignore la seconde, collee a la premiere.
    if (marques.length && m.index - marques[marques.length - 1].pos < 40) {
      marques[marques.length - 1].officiels = true;
      continue;
    }
    marques.push({ pos: m.index, officiels: /--officials/.test(m[1]) });
  }
  return marques.map((x, i) => ({
    ...x,
    html: html.slice(x.pos, marques[i + 1] ? marques[i + 1].pos : html.length),
  }));
}

/**
 * Les joueurs d'un bloc d'equipe, ranges par groupe.
 *
 * On releve d'abord les liens, puis on decoupe le bloc entre deux liens
 * successifs. Lire chaque fiche dans sa propre tranche evite le piege des
 * expressions gourmandes : un numero manquant ferait autrement emprunter celui
 * du joueur suivant, en silence.
 */
function joueursDuBloc(bloc) {
  const titres = [];
  RE_TITRE.lastIndex = 0;
  let m;
  while ((m = RE_TITRE.exec(bloc))) {
    const g = groupe(m[1]);
    if (g) titres.push({ pos: m.index, groupe: g });
  }

  const liens = [];
  RE_JOUEUR.lastIndex = 0;
  while ((m = RE_JOUEUR.exec(bloc))) liens.push({ pos: m.index, id: Number(m[1]), classes: m[2] });

  const sortie = { titulaires: [], remplacants: [] };

  liens.forEach((lien, i) => {
    const fiche = bloc.slice(lien.pos, liens[i + 1] ? liens[i + 1].pos : bloc.length);
    const num = RE_NUMERO.exec(fiche);
    const nom = RE_NOM.exec(fiche);
    if (!nom) return;

    const g = [...titres].reverse().find((t) => t.pos < lien.pos)?.groupe
      // Sans intertitre lisible, on se rabat sur le numero : au-dela de 15,
      // c'est le banc. Mieux vaut un classement approche qu'une liste vide.
      || (num && Number(num[1]) > MIN_TITULAIRES ? 'remplacants' : 'titulaires');

    const poste = RE_POSTE.exec(fiche);
    sortie[g].push({
      id: lien.id,
      numero: num ? Number(num[1]) : null,
      nom: decode(nom[1]),
      poste: poste ? decode(poste[1]) : null,
      capitaine: /player-block--captain/.test(lien.classes),
    });
  });

  sortie.titulaires.sort((a, b) => (a.numero || 99) - (b.numero || 99));
  sortie.remplacants.sort((a, b) => (a.numero || 99) - (b.numero || 99));
  return sortie;
}

/** L'arbitre central, s'il est annonce. Le reste des officiels ne nous sert pas. */
function arbitre(bloc) {
  if (!bloc) return null;
  RE_OFFICIEL.lastIndex = 0;
  let m;
  while ((m = RE_OFFICIEL.exec(bloc))) {
    if (/arbitre\s+central/i.test(decode(m[2]))) return decode(m[1]);
  }
  return null;
}

const videEquipe = () => ({ titulaires: [], remplacants: [] });

/**
 * Analyse une page « compositions ».
 *
 * Rend toujours un objet, meme vide : c'est a l'appelant de decider qu'une
 * composition a moins de quinze titulaires n'est pas encore publiee. La
 * distinction compte, parce que les deux cas sont normaux — la page existe des
 * l'annonce du calendrier, et ne se remplit que deux jours avant.
 *
 * Trois champs disent a l'appelant ce qu'il peut en faire :
 *
 *   ordreConnu   l'en-tete a ete lu, donc on sait a qui appartient chaque
 *                quinze. A faux, la composition n'est PAS exploitable, meme
 *                complete — on ne saurait pas de quel cote la ranger.
 *   complete     les deux quinze sont publies.
 *   visiteurEnPremier  l'ordre reellement rencontre, garde pour le rapport et
 *                pour qu'une anomalie future soit lisible sans relire la page.
 */
function parseCompositions(html) {
  const page = String(html || '');
  const pitch = RE_PITCH.exec(page);
  const entete = pitch ? pitch[0] : '';
  const ordreConnu = !!pitch;

  const tous = blocs(page);
  const equipes = tous.filter((b) => !b.officiels);
  const off = tous.find((b) => b.officiels);

  const premier = equipes[0] ? joueursDuBloc(equipes[0].html) : videEquipe();
  const second = equipes[1] ? joueursDuBloc(equipes[1].html) : videEquipe();

  // La seule ligne qui compte vraiment dans ce fichier.
  const visiteurEnPremier = ordreConnu && RE_VISITEUR_DABORD.test(entete);
  const home = visiteurEnPremier ? second : premier;
  const away = visiteurEnPremier ? premier : second;

  return {
    homeTeam: decode(RE_HOME_ATTR.exec(entete)?.[1] || '') || null,
    awayTeam: decode(RE_AWAY_ATTR.exec(entete)?.[1] || '') || null,
    ordreConnu,
    visiteurEnPremier,
    arbitre: arbitre(off?.html),
    home,
    away,
    complete:
      ordreConnu &&
      home.titulaires.length >= MIN_TITULAIRES &&
      away.titulaires.length >= MIN_TITULAIRES,
  };
}

/** L'URL de l'onglet compositions, a partir du chemin de feuille de match. */
function urlCompositions(sheetPath) {
  if (!sheetPath) return null;
  const chemin = String(sheetPath).replace(/^\/+/, '').replace(/\/+$/, '');
  return `${BASE}/${chemin}/compositions`;
}

/**
 * Lit les compositions d'une rencontre. Ne leve pas sur une page vide — une
 * composition non publiee n'est pas une panne — mais leve sur une erreur
 * reseau, pour que l'appelant puisse la distinguer.
 */
async function fetchCompositions(sheetPath) {
  const url = urlCompositions(sheetPath);
  if (!url) throw new Error('chemin de feuille de match manquant');

  const res = await axios.get(url, {
    timeout: TIMEOUT,
    headers: { 'User-Agent': 'top14-pronostics/1.0 (usage prive)' },
  });

  return { ...parseCompositions(String(res.data)), url };
}

module.exports = {
  parseCompositions, fetchCompositions, urlCompositions, decode, MIN_TITULAIRES,
};
