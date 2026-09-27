/**
 * Le classement officiel du Top 14, lu directement sur la page de la LNR.
 *
 * ----------------------------------------------------------------------------
 * UNE ERREUR A CORRIGER D'ABORD
 *
 * `lnr.js` affirme, en tete de fichier, que la page classement de la LNR est
 * « construite dans le navigateur ». C'est faux. Elle est rendue par le
 * serveur, exactement comme le calendrier : le tableau complet est dans le HTML,
 * quatorze lignes, points, victoires, points marques et encaisses, etat de forme
 * et prochain match compris.
 *
 * Cette affirmation n'a jamais ete verifiee. Elle a ete ecrite a un moment ou la
 * page n'etait pas accessible, et elle a servi de justification a tout un
 * service de recalcul du classement a partir des resultats — plus de cent lignes
 * de bareme, de bonus et de departages, pour reconstituer un tableau qui etait
 * disponible tel quel.
 *
 * C'est la meme lecon que la pastille violette illisible et que le classement
 * fige quatre jours : **verifier ce qui est reellement servi**. Une supposition
 * ecrite dans un commentaire prend la couleur d'un fait au bout de quelques
 * semaines.
 * ----------------------------------------------------------------------------
 *
 * Ce que la page apporte, et que le calcul ne pouvait pas donner :
 *
 *   - le classement **homologue**, celui qui fait foi, et non une
 *     reconstitution qui coincide ;
 *   - les points de penalisation eventuels, qu'aucun calcul ne peut deviner ;
 *   - les departages officiels deja appliques ;
 *   - l'etat de forme, les quatre derniers resultats de chaque club ;
 *   - le prochain match, avec domicile ou exterieur.
 *
 * Structure de la page, et son piege principal. Le tableau est coupe en deux
 * blocs paralleles pour permettre le defilement horizontal sur mobile :
 *
 *   ranking__fixed-block    -> rang, variation, logo du club   (colonne figee)
 *   ranking__scroll-block   -> nom, points, M, G, N, P, ...    (partie qui defile)
 *
 * Les deux blocs ne sont relies par rien d'autre que **l'ordre des lignes**.
 * On pourrait donc apparier par indice — et se tromper silencieusement le jour
 * ou la LNR insere une ligne de separation dans l'un des deux. On apparie donc
 * par nom de club : le bloc figé porte le nom dans l'attribut `alt` du logo, le
 * bloc defilant dans le lien vers la fiche du club.
 *
 * Deuxieme precaution : l'ordre des colonnes est **lu dans l'en-tete**, pas
 * suppose. Si la LNR intervertit « Pts M. » et « Pts E. » un jour de
 * refactorisation, on le suit sans rien casser ; et si une colonne attendue
 * disparait, on leve plutot que de rendre un classement dont une colonne
 * signifie autre chose que son nom.
 */

const axios = require('axios');

const BASE = process.env.LNR_BASE || 'https://top14.lnr.fr';
const SEASON = process.env.LNR_SEASON || '2026-2027';
const TIMEOUT = 15000;

/** Les quatorze clubs du Top 14. En deca, la page n'est pas celle qu'on croit. */
const MIN_CLUBS = 14;

const RE_LIGNE_DEFILANTE = /table-line--ranking-scrollable/g;
const RE_LIGNE_FIGEE = /table-line--ranking-fixed/g;
const RE_ENTETE = /table-line--full-ranking-heading[^"]*"/;

// Les en-tetes des colonnes **numeriques** seulement, avec leur wrapper : c'est
// ce qui garantit que la position lue dans l'en-tete est la meme que celle des
// cellules chiffrees d'une ligne. Les colonnes « Etat de forme » et « Prochain
// match » ont leur propre wrapper et ne comptent donc pas dans cet ordre.
const RE_TETE = /table-line__cell-wrapper--small"[^>]*>\s*<div class="ranking__head">\s*([^<]*?)\s*</g;
const RE_CLUB_LIEN = /href="[^"]*\/club\/([a-z0-9-]+)"[^>]*>\s*([^<]+?)\s*<\/a>/;
const RE_CELLULE = /table-line__cell-wrapper--small">\s*<div[^>]*>\s*([+-]?[\d]+)\s*</g;
const RE_LOGO_ALT = /table-line__cell-image[^>]*\s+alt="([^"]*)"|alt="([^"]*)"[^>]*class="[^"]*table-line__cell-image/;
const RE_RANG = /ranking-item__rank[^"]*"[^>]*>\s*(\d+)\s*</;
const RE_VARIATION = /ranking-item__rank--(same|up|down)/;
const RE_FORME = /matches-history__match matches-history__match--([a-z]+)/g;
const RE_PROCHAIN_LIEN = /class="next-match"[\s\S]{0,80}?|href="([^"]*)"\s+class="next-match"/;
const RE_PROCHAIN_HREF = /href="([^"]*)"\s+class="next-match"/;
const RE_PROCHAIN_LIEU = /next-match__location">\s*<i class="icon icon--(home|away)"/;
const RE_PROCHAIN_TEXTES = /next-match__text">\s*([^<]+?)\s*</g;

const RE_SEMAINE = /:current-week='([\s\S]{0,4000}?)'\s/;
const RE_NUMERO = /"number":(\d+)/;

/**
 * L'en-tete, tel qu'il est ecrit, ramene aux noms qu'on utilise en base.
 * Ce qui n'est pas dans cette table est ignore sans bruit.
 */
const COLONNES = {
  'Pts': 'points',
  'M': 'played',
  'G': 'won',
  'N': 'drawn',
  'P': 'lost',
  'Bonus': 'bonus',
  'Pts M.': 'pointsFor',
  'Pts E.': 'pointsAgainst',
  'Diff': 'diff',
};

/** Sans ces colonnes-la, le tableau ne vaut rien : mieux vaut lever. */
const OBLIGATOIRES = ['points', 'played', 'won', 'lost', 'pointsFor', 'pointsAgainst'];

const nettoyer = (t) =>
  String(t || '').replace(/&#0?39;/g, '\'').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/** Decoupe un bloc sur un marqueur de ligne, et rend les tranches. */
function tranches(html, re) {
  const bornes = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(html))) bornes.push(m.index);
  return bornes.map((d, i) => html.slice(d, bornes[i + 1] ?? html.length));
}

/**
 * L'ordre des colonnes, lu dans la ligne d'en-tete.
 *
 * Rend par exemple ['points','played','won','drawn','lost','bonus','pointsFor',
 * 'pointsAgainst','diff'] — c'est-a-dire ce que signifient, dans l'ordre, les
 * cellules numeriques de chaque ligne.
 */
function ordreDesColonnes(html) {
  // On cherche dans le bloc defilant seulement. Le bloc figé porte lui aussi une
  // ligne d'en-tete — `...-heading-fixed` — qui vient en premier dans la page et
  // ne contient que « Rang » et « Club ». La trouver a la place de l'autre rend
  // un ordre vide, et donc une page declaree illisible alors qu'elle est
  // parfaitement lisible.
  const scroll = html.indexOf('ranking__scroll-block');
  const zone = scroll >= 0 ? html.slice(scroll) : html;

  const depart = RE_ENTETE.exec(zone);
  if (!depart) return null;
  const bloc = zone.slice(depart.index, depart.index + 6000);

  // Une colonne inconnue occupe une place : elle entre dans l'ordre sous la
  // valeur `null`, et n'est pas simplement sautee. La sauter decalerait toutes
  // les colonnes suivantes d'un cran — et le jour ou la LNR ajoutera « Essais »
  // entre « Bonus » et « Pts M. », le classement afficherait des points marques
  // qui seraient en realite des essais. Un test l'a attrapee ici.
  const ordre = [];
  RE_TETE.lastIndex = 0;
  let m;
  while ((m = RE_TETE.exec(bloc))) ordre.push(COLONNES[nettoyer(m[1])] || null);

  return ordre.some(Boolean) ? ordre : null;
}

/** Les quatre derniers resultats, du plus ancien au plus recent. */
function etatDeForme(bloc) {
  const suite = [];
  RE_FORME.lastIndex = 0;
  let m;
  while ((m = RE_FORME.exec(bloc))) {
    const l = m[1].toLowerCase();
    if (l === 'ranking') continue;               // la classe de mise en forme
    suite.push(l === 'v' ? 'V' : l === 'd' ? 'D' : l === 'n' ? 'N' : l.toUpperCase());
  }
  return suite;
}

/** La prochaine rencontre : adversaire, lieu, date telle qu'affichee. */
function prochainMatch(bloc) {
  const href = RE_PROCHAIN_HREF.exec(bloc);
  if (!href) return null;

  const lieu = RE_PROCHAIN_LIEU.exec(bloc);
  const textes = [];
  RE_PROCHAIN_TEXTES.lastIndex = 0;
  let m;
  while ((m = RE_PROCHAIN_TEXTES.exec(bloc))) textes.push(nettoyer(m[1]));

  return {
    url: href[1],
    adversaire: textes[0] || null,
    date: textes[1] || null,
    domicile: lieu ? lieu[1] === 'home' : null,
  };
}

/** Le bloc figé : rang, variation, club. */
function lignesFigees(html) {
  const debut = html.indexOf('ranking__fixed-block');
  const fin = html.indexOf('ranking__scroll-block');
  if (debut < 0) return [];
  const bloc = html.slice(debut, fin > debut ? fin : html.length);

  return tranches(bloc, RE_LIGNE_FIGEE).map((t) => {
    const rang = RE_RANG.exec(t);
    const variation = RE_VARIATION.exec(t);
    const alt = RE_LOGO_ALT.exec(t);
    return {
      rank: rang ? Number(rang[1]) : null,
      variation: variation ? variation[1] : null,
      club: nettoyer(alt ? (alt[1] || alt[2]) : ''),
    };
  }).filter((l) => l.club);
}

/** Le bloc defilant : nom, chiffres, forme, prochain match. */
function lignesDefilantes(html, ordre) {
  const debut = html.indexOf('ranking__scroll-block');
  const bloc = debut >= 0 ? html.slice(debut) : html;

  return tranches(bloc, RE_LIGNE_DEFILANTE).map((t) => {
    const club = RE_CLUB_LIEN.exec(t);
    if (!club) return null;

    const valeurs = [];
    RE_CELLULE.lastIndex = 0;
    let m;
    while ((m = RE_CELLULE.exec(t))) valeurs.push(Number(m[1]));

    const ligne = { slug: club[1], club: nettoyer(club[2]) };
    ordre.forEach((clef, i) => { if (clef) ligne[clef] = valeurs[i] ?? null; });

    ligne.forme = etatDeForme(t);
    ligne.prochain = prochainMatch(t);
    return ligne;
  }).filter(Boolean);
}

/**
 * Analyse la page classement.
 *
 * Leve plutot que de rendre un tableau partiel : un classement a treize clubs ou
 * dont une colonne manque est plus dangereux qu'une absence de classement, parce
 * qu'il s'affiche sans avoir l'air faux.
 */
function parseClassement(html) {
  const page = String(html || '');

  const ordre = ordreDesColonnes(page);
  if (!ordre) throw new Error('en-tete du classement introuvable — la page a change de structure');

  const manquantes = OBLIGATOIRES.filter((c) => !ordre.includes(c));
  if (manquantes.length) {
    throw new Error(`colonnes manquantes dans l'en-tete : ${manquantes.join(', ')}`);
  }

  const defilantes = lignesDefilantes(page, ordre);
  if (defilantes.length < MIN_CLUBS) {
    throw new Error(
      `${defilantes.length} clubs lus sur ${MIN_CLUBS} attendus — rien n'a ete retenu`
    );
  }

  // L'appariement par NOM, et non par indice : les deux blocs ne sont relies que
  // par l'ordre des lignes, et une ligne inseree d'un cote decalerait tout.
  const figees = new Map(lignesFigees(page).map((l) => [l.club, l]));

  const lignes = defilantes.map((l) => {
    const f = figees.get(l.club);
    return {
      ...l,
      rank: f ? f.rank : null,
      variation: f ? f.variation : null,
      diff: Number.isFinite(l.diff) ? l.diff : (l.pointsFor - l.pointsAgainst),
    };
  });

  const sansRang = lignes.filter((l) => l.rank === null).map((l) => l.club);
  if (sansRang.length) {
    throw new Error(`rang introuvable pour ${sansRang.join(', ')} — appariement rompu`);
  }

  const semaine = RE_SEMAINE.exec(page);
  const numero = semaine ? RE_NUMERO.exec(semaine[1]) : null;

  return {
    lignes: [...lignes].sort((a, b) => a.rank - b.rank),
    // La journee annoncee par la page et la profondeur reelle du tableau ne
    // coincident pas toujours : le 27 septembre 2026 la page se disait « J3 »
    // alors que ses lignes comptaient deja quatre rencontres. C'est la seconde
    // qui dit la verite, d'ou les deux valeurs.
    journeeAnnoncee: numero ? Number(numero[1]) : null,
    journeesJouees: Math.max(...lignes.map((l) => l.played || 0)),
  };
}

/** Lit le classement en ligne. */
async function fetchClassement({ season = SEASON } = {}) {
  const url = `${BASE}/classement/${season}`;
  const res = await axios.get(url, {
    timeout: TIMEOUT,
    headers: { 'User-Agent': 'top14-pronostics/1.0 (usage prive)' },
  });
  return { ...parseClassement(String(res.data)), url };
}

module.exports = {
  parseClassement, fetchClassement, ordreDesColonnes, etatDeForme, prochainMatch,
  COLONNES, OBLIGATOIRES, MIN_CLUBS,
};
