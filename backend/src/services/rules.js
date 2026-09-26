/**
 * Les regles de jeu : ce qui multiplie les points, et a partir de quand.
 *
 * Tout est rassemble ici parce que ce sont les seuls nombres du projet que
 * l'on discutera entre amis. Les changer ne doit demander de lire qu'un
 * fichier, et le fichier de tests a cote dit ce que chacun fait.
 *
 * Le bareme lui-meme — combien vaut un bon pronostic — est dans scoring.js.
 * Ici on ne parle que de ce qui le multiplie.
 */

/**
 * Le joker et le match de la semaine ne comptent qu'a partir de cette journee.
 *
 * C'est une question d'equite, pas de technique : les points des journees 1 a 5
 * ont ete marques sous d'autres regles, et personne n'a pu poser de joker
 * dessus. Une regle qui s'appliquerait retroactivement se contesterait a juste
 * titre.
 *
 * La variable d'environnement permet de la deplacer sans redeployer — utile
 * pour essayer sur une journee passee en developpement.
 */
const DEPUIS = Number(process.env.JOKER_DEPUIS || 6);

const MULT_JOKER = 2;
const MULT_AFFICHE = 3;

/** Les multiplicateurs s'appliquent-ils a cette journee ? */
function actif(round) {
  return Number.isFinite(round) && round >= DEPUIS;
}

/**
 * Le multiplicateur d'un pronostic.
 *
 * Le joker est interdit sur le match de la semaine — c'est la regle choisie, et
 * elle est verifiee a l'ecriture, dans le controleur. La ligne `affiche`
 * d'abord n'est donc pas un cumul deguise : c'est un filet, pour qu'une donnee
 * incoherente en base donne un resultat previsible plutot qu'un x6 surprise.
 */
function multiplicateur({ joker = false, affiche = false, round } = {}) {
  if (!actif(round)) return 1;
  if (affiche) return MULT_AFFICHE;
  if (joker) return MULT_JOKER;
  return 1;
}

/**
 * Le match de la semaine d'une journee : celui qui commence le plus tard.
 *
 * La LNR place son affiche le dimanche soir, a 21h05. Prendre le dernier coup
 * d'envoi donne donc la tete d'affiche sans avoir a la designer a la main, et
 * sans page d'administration a maintenir.
 *
 * A egalite d'horaire, le plus petit identifiant tranche : il faut que la
 * reponse soit la meme d'un appel a l'autre, sans quoi le match de la semaine
 * changerait tout seul.
 *
 * Rend null si la journee est vide ou si aucun horaire n'est connu — mieux vaut
 * pas d'affiche qu'une affiche tiree au hasard.
 */
function afficheDeLaJournee(matchs) {
  const avecHeure = (matchs || []).filter((m) => m && m.kickoff);
  if (!avecHeure.length) return null;

  return avecHeure.reduce((meilleur, m) => {
    const a = new Date(m.kickoff).getTime();
    const b = new Date(meilleur.kickoff).getTime();
    if (a > b) return m;
    if (a < b) return meilleur;
    return m.id < meilleur.id ? m : meilleur;
  });
}

/**
 * Une journee a-t-elle commence ?
 *
 * Sert a figer le match de la semaine : tant que rien n'a demarre, un
 * changement d'horaire peut le deplacer ; des le premier coup d'envoi, il ne
 * bouge plus. Sans cette regle, un decalage annonce par la LNR le samedi soir
 * pourrait changer l'affiche au milieu de la journee, apres que des joueurs
 * ont place leur joker en consequence.
 */
function journeeCommencee(matchs, maintenant = Date.now()) {
  return (matchs || []).some((m) => m.kickoff && new Date(m.kickoff).getTime() <= maintenant);
}

module.exports = {
  DEPUIS, MULT_JOKER, MULT_AFFICHE,
  actif, multiplicateur, afficheDeLaJournee, journeeCommencee,
};
