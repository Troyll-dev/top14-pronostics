/**
 * La journee « de la semaine » : celle qu'on ouvre par defaut sur la page
 * « Tous les pronos ».
 *
 * ---------------------------------------------------------------------------
 * La regle, telle qu'elle a ete enoncee
 * ---------------------------------------------------------------------------
 *
 * Le mercredi on bascule sur la journee suivante, et on y reste jusqu'au
 * mercredi d'apres. Rien de plus.
 *
 * ---------------------------------------------------------------------------
 * Pourquoi ce n'est plus le navigateur qui decide
 * ---------------------------------------------------------------------------
 *
 * La premiere version lisait le jour de la semaine dans le navigateur et
 * choisissait entre les deux valeurs deja servies, `round` et `currentRound`.
 * Elle avait deux defauts.
 *
 * Le premier tenait a l'horloge : un joueur dont le telephone est mal regle, ou
 * qui voyage, ne voyait pas la meme journee que les autres. Une regle de jeu ne
 * devrait pas dependre de la machine qui la regarde.
 *
 * Le second etait plus subtil et c'est celui qu'on ferme ici. `round` designe la
 * prochaine journee **a pronostiquer** : des que le dernier match d'une journee
 * a donne son coup d'envoi, `round` passe a la suivante. Sur une journee etalee
 * du samedi au dimanche, ca tombe bien — le samedi soir il reste des matchs le
 * lendemain, donc `round` designe encore la journee en cours. Mais sur une
 * journee jouee integralement le samedi, le dernier coup d'envoi passe le samedi
 * en debut de soiree : la page basculait alors sur la journee suivante, vide,
 * le temps d'une soiree — precisement au moment ou l'on vient regarder les
 * resultats. Ca n'arrive pas sur une journee ordinaire de Top 14, mais ca arrive
 * sur une journee decalee en semaine.
 *
 * Le jour de la semaine ne permet pas de distinguer les deux cas : le samedi
 * matin c'est `round` qui a raison, le samedi soir c'est `currentRound`. D'ou ce
 * changement de point de vue — on ne choisit plus entre deux valeurs calculees
 * pour autre chose, on repond directement a la question posee : quelle journee
 * se joue dans la semaine en cours, la semaine commencant le mercredi.
 *
 * ---------------------------------------------------------------------------
 * Fuseau
 * ---------------------------------------------------------------------------
 *
 * Le mercredi est un mercredi a Paris. Le serveur tourne en UTC : en heure d'ete
 * française, le mercredi commence donc le mardi a 22 h UTC. Sans ca la bascule
 * arriverait deux heures trop tard, ce qui ne se verrait jamais — sauf le jour
 * ou quelqu'un regarde le site le mercredi a 1 h du matin, et ou personne ne
 * comprendrait pourquoi.
 */

const FUSEAU = 'Europe/Paris';
const JOUR_MS = 24 * 60 * 60 * 1000;

/** Le decalage de Paris sur UTC, en minutes, a cet instant precis. */
function decalage(d) {
  const s = new Intl.DateTimeFormat('en-US', {
    timeZone: FUSEAU,
    timeZoneName: 'longOffset',
  }).format(d);
  const m = s.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

/** La date civile parisienne d'un instant, en `AAAA-MM-JJ`. */
function jourParis(d) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSEAU,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Le jour de la semaine a Paris : 0 dimanche … 3 mercredi … 6 samedi. */
function jourSemaineParis(d) {
  const nom = new Intl.DateTimeFormat('en-US', { timeZone: FUSEAU, weekday: 'short' }).format(d);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(nom);
}

/** L'instant absolu de minuit a Paris, pour une date civile `AAAA-MM-JJ`. */
function minuitParis(ymd) {
  // On part de minuit UTC ce jour-la et on retranche le decalage. Le decalage
  // est lu a cet instant : un changement d'heure tombe un dimanche a 1 h UTC,
  // donc jamais entre minuit UTC et minuit parisien d'un mercredi.
  const minuitUtc = new Date(`${ymd}T00:00:00.000Z`);
  return new Date(minuitUtc.getTime() - decalage(minuitUtc) * 60000);
}

/**
 * Le mercredi 0 h (heure de Paris) qui precede ou ouvre cet instant.
 *
 * Un mercredi a 0 h 30 se trouve dans sa propre semaine : la bascule est
 * immediate, elle n'attend pas le mercredi suivant.
 */
function debutSemaine(maintenant = new Date()) {
  const recul = (jourSemaineParis(maintenant) - 3 + 7) % 7;
  // Le recul se fait sur la date civile, a midi, pour qu'un changement d'heure
  // au milieu de la semaine ne fasse pas atterrir sur la veille.
  const midi = new Date(`${jourParis(maintenant)}T12:00:00.000Z`);
  const vise = new Date(midi.getTime() - recul * JOUR_MS);
  return minuitParis(vise.toISOString().slice(0, 10));
}

/**
 * La journee a ouvrir, a partir de ce que la base sait dire.
 *
 * - `semaine` : la journee du premier match programme dans la semaine en cours.
 *   C'est la reponse dans tous les cas ordinaires, y compris le samedi soir
 *   d'une journee jouee d'un seul tenant : le match du jour appartient bien a la
 *   semaine, meme une fois joue.
 * - `derniere` : la derniere journee commencee. Elle sert pendant les semaines
 *   creuses — treve internationale, coupure de fin d'annee — ou aucun match
 *   n'est programme. On reste alors sur la derniere jouee plutot que de sauter
 *   sur une journee lointaine et vide.
 * - `prochaine` : le repli d'avant-saison, quand rien n'a encore ete joue.
 */
function choisirJournee({ semaine, derniere, prochaine } = {}) {
  return semaine ?? derniere ?? prochaine ?? 1;
}

module.exports = { debutSemaine, choisirJournee, JOUR_MS };
