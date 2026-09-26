/**
 * Le bareme des pronostics, et rien d'autre.
 *
 * Cette regle etait ecrite a l'interieur de la boucle qui met la base a jour.
 * C'est un endroit ou personne ne peut la verifier : pour savoir si un prono
 * 20-18 sur un 15-14 vaut 1 ou 2 points, il fallait une base de donnees, des
 * pronostics enregistres, et lire le resultat apres coup. Autrement dit, la
 * seule facon de tester le bareme etait de jouer une journee.
 *
 * Ici c'est une fonction qui prend deux couples de nombres et rend un nombre.
 * Elle ne touche a rien, ne depend de rien, et se verifie en une ligne. Le
 * fichier de tests a cote couvre les cas limites — le match nul, l'ecart juste
 * a la frontiere des cinq points, le prono exact d'un nul.
 *
 * Bareme :
 *   score exact                                        3 points
 *   bon vainqueur, et chaque score a 5 pres            2 points
 *   bon vainqueur                                      1 point
 *   mauvais vainqueur                                  0 point
 *
 * Le 2 points, et pourquoi il a change.
 *
 * Il se lisait autrefois sur l'ECART : on comparait l'ecart predit a l'ecart
 * reel, et deux points s'il y avait moins de cinq points entre les deux. La
 * regle etait incomprehensible a l'usage, et pour une bonne raison — elle ne
 * regardait pas les scores du tout. Predire 20-10 sur un vrai 40-30 donnait
 * deux points, les deux ecarts valant dix, alors qu'on s'etait trompe de vingt
 * points sur chaque equipe. On ne pouvait pas deviner ce qui rapportait.
 *
 * Desormais on compare les scores eux-memes, equipe par equipe : deux points
 * si l'on est a cinq points ou moins du vrai score des deux cotes. C'est ce
 * qu'on veut dire quand on dit « j'etais tout pres », et ca se verifie d'un
 * coup d'oeil sur la feuille de match.
 */

// L'ecart tolere sur chaque equipe, en deca duquel le bon vainqueur vaut 2
// points au lieu d'un seul. Nomme plutot qu'ecrit en dur : c'est le nombre
// qu'on voudra discuter un jour, pas les 3/2/1/0.
const MARGE = 5;

/**
 * @param {{homeScorePred:number, awayScorePred:number}} prono
 * @param {{homeScore:number, awayScore:number}} resultat
 * @returns {number} 0, 1, 2 ou 3
 */
function pointsFor(prono, resultat) {
  const { homeScorePred: ph, awayScorePred: pa } = prono;
  const { homeScore: rh, awayScore: ra } = resultat;

  // Un resultat incomplet ne rapporte rien et ne doit surtout pas lever :
  // cette fonction est appelee dans une boucle sur tous les pronos d'un match.
  if (rh === null || ra === null || rh === undefined || ra === undefined) return 0;
  if (ph === null || pa === null || ph === undefined || pa === undefined) return 0;

  if (ph === rh && pa === ra) return 3;

  // Math.sign rend -1, 0 ou 1 : le match nul est donc un « vainqueur » a part
  // entiere, et predire un nul sur un nul compte comme un bon vainqueur.
  //
  // Le bon vainqueur reste la condition d'entree : un pronostic tres proche
  // mais du mauvais cote ne rapporte rien. Dire qui gagne est l'enjeu
  // principal, et un bareme ou l'on marque en se trompant de vainqueur
  // brouillerait ce message.
  if (Math.sign(ph - pa) !== Math.sign(rh - ra)) return 0;

  // Les deux cotes doivent etre proches, pas seulement leur moyenne : sinon
  // une erreur de dix points d'un cote se compenserait avec dix de l'autre.
  const proche = Math.abs(ph - rh) <= MARGE && Math.abs(pa - ra) <= MARGE;
  return proche ? 2 : 1;
}

module.exports = { pointsFor, MARGE };
