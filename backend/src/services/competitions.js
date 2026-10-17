/**
 * Les compétitions de l'application.
 *
 * Jusqu'au Tournoi des Six Nations 2027, il n'y en avait qu'une, et le code ne
 * le disait nulle part : chaque requête supposait que tout match en base était
 * un match du Top 14. Deux compétitions dans la même table rendent cette
 * supposition fausse, et elle l'est silencieusement — Irlande–Angleterre
 * apparaîtrait dans la J1 du championnat, et ses points s'ajouteraient au
 * classement général.
 *
 * Les noms sont ici, en un seul endroit, pour qu'une faute de frappe dans un
 * filtre ne puisse pas passer pour une compétition vide : on importe la
 * constante, on n'écrit jamais la chaîne à la main.
 */

/** Le championnat de France. Valeur par défaut de la colonne en base. */
const TOP14 = 'TOP14';

/** Le Tournoi des Six Nations, à partir de l'édition 2027. */
const SIX_NATIONS = 'SIX_NATIONS';

const TOUTES = [TOP14, SIX_NATIONS];

/** Une valeur venue d'une requête HTTP, ramenée à une compétition connue. */
function lire(valeur, parDefaut = TOP14) {
  return TOUTES.includes(valeur) ? valeur : parDefaut;
}

/**
 * La saison en cours de chaque compétition, telle qu'elle est écrite en base.
 *
 * Le championnat s'étale sur deux années (« 2026-2027 »), le Tournoi tient
 * dans un printemps (« 2027 »). Les deux variables d'environnement sont celles
 * que le reste du code lit déjà : changer de saison ne demande donc de toucher
 * qu'un réglage Railway, pas ce fichier.
 */
const SAISONS = {
  [TOP14]: process.env.SPORTSDB_SEASON || '2026-2027',
  [SIX_NATIONS]: String(process.env.SIX_NATIONS_ANNEE || 2027),
};

function saison(competition) {
  return SAISONS[lire(competition)];
}

module.exports = { TOP14, SIX_NATIONS, TOUTES, lire, saison };
