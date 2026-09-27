/**
 * Le departage du classement des joueurs, et rien d'autre.
 *
 * Il existait en deux exemplaires : le site triait par points puis par nombre
 * de scores exacts, le bilan du lundi par points puis par ordre alphabetique.
 * Les deux donnaient le meme premier sur la J3 par coincidence — un joueur
 * avait a la fois le score exact et l'anteriorite alphabetique — et la
 * coincidence n'allait pas tenir. Un joueur aurait lu « tu es 2e » dans le mail
 * et se serait vu 1er en cliquant.
 *
 * D'ou ce fichier : une seule fonction, appelee par le classement general, le
 * classement d'une journee et le bilan du lundi. Deux implementations d'une
 * meme regle finissent toujours par diverger ; une seule ne le peut pas.
 *
 * Les quatre criteres, dans l'ordre :
 *
 *   1. les points ;
 *   2. le plus de scores exacts — le fait rare de la saison ;
 *   3. le plus de pronostics a cinq points pres — la regularite dans la
 *      precision, suite logique du bareme ;
 *   4. la plus petite somme d'ecarts.
 *
 * Le quatrieme merite l'explication, parce que c'est lui qui fait tenir
 * l'ensemble.
 *
 * Pour chaque pronostic on additionne l'erreur sur les deux equipes — predire
 * 20-15 sur un 22-12 fait 2 + 3 = 5 — et on cumule sur toute la saison. Le plus
 * petit total passe devant.
 *
 * Trois qualites. Il ne tombe jamais en panne : deux joueurs ayant exactement
 * la meme somme d'ecarts sur vingt-six journees, c'est une coincidence qu'on ne
 * verra pas. Il tient compte des pronostics **rates**, que les trois premiers
 * criteres ignorent completement — celui qui s'est trompe de vainqueur en etant
 * a trois points du score a mieux travaille que celui qui s'est trompe de
 * trente. Et il se dit en une phrase : celui qui a ete globalement le plus
 * proche.
 *
 * L'ordre alphabetique reste en cinquieme position pour que le tri soit
 * deterministe, mais il ne devrait jamais servir. C'est d'ailleurs pour ne plus
 * dependre de lui qu'on a ecrit les quatre autres : il avantageait Christian a
 * vie.
 */

/**
 * La premiere journee qui compte au classement general.
 *
 * Les journees 1 et 2 sont exclues parce qu'un seul joueur y a pronostique :
 * le site venait d'ouvrir, les autres n'avaient pas encore de compte. Les
 * garder donnerait a ce joueur une avance que personne n'a eu l'occasion de
 * disputer — ce n'est pas une performance, c'est une anteriorite.
 *
 * Les points de ces journees restent attribues et visibles journee par
 * journee : on ne reecrit pas l'histoire, on decide seulement de ce que le
 * classement general additionne.
 *
 * La variable d'environnement permet de deplacer ce seuil sans redeployer, et
 * `CLASSEMENT_DEPUIS=1` retablit le comportement d'origine.
 */
const DEPUIS = Number(process.env.CLASSEMENT_DEPUIS || 3);

/**
 * Ce pronostic compte-t-il au classement general ?
 *
 * Exportee plutot qu'appliquee dans `stats`, parce que le classement d'une
 * journee doit pouvoir compter la J1 et la J2 : sur ces pages-la, la question
 * n'est pas l'equite du cumul mais ce qui s'est passe ce week-end-la.
 */
function retenuAuClassement(prono) {
  const round = prono?.match?.round;
  return !Number.isFinite(round) || round >= DEPUIS;
}

/**
 * L'ecart total d'un pronostic : la somme des erreurs sur les deux equipes.
 *
 * Rend `null` quand la rencontre n'a pas de score : une rencontre non jouee ne
 * doit ni aider ni penaliser.
 */
function ecart(prono, match) {
  if (!match || match.homeScore === null || match.homeScore === undefined) return null;
  if (match.awayScore === null || match.awayScore === undefined) return null;
  if (prono.homeScorePred === null || prono.homeScorePred === undefined) return null;
  if (prono.awayScorePred === null || prono.awayScorePred === undefined) return null;
  return Math.abs(prono.homeScorePred - match.homeScore) +
         Math.abs(prono.awayScorePred - match.awayScore);
}

/**
 * Les quatre nombres qui servent au departage, calcules sur une liste de
 * pronostics deja notes.
 *
 * `basePoints` porte le bareme de 0 a 3 ; `points` porte le total, joker et
 * affiche compris. Les statistiques se comptent donc sur le premier et le total
 * s'additionne sur le second — un score exact joue en joker vaut six points et
 * reste un seul score exact.
 *
 * Le repli sur `points` couvre les pronostics d'avant les multiplicateurs, dont
 * `basePoints` est nul : a cette epoque les deux valeurs etaient egales.
 */
function stats(pronos) {
  let points = 0, exacts = 0, proches = 0, ecarts = 0;

  for (const p of pronos) {
    points += p.points || 0;
    const base = p.basePoints ?? p.points;
    if (base === 3) exacts++;
    else if (base === 2) proches++;

    const e = ecart(p, p.match);
    if (e !== null) ecarts += e;
  }

  return { points, exacts, proches, ecarts };
}

/**
 * Compare deux lignes de classement. A passer directement a `sort`.
 *
 * Les trois premiers criteres se lisent « le plus grand gagne », le quatrieme
 * « le plus petit gagne » — d'ou l'inversion sur `ecarts`, qui est une erreur
 * cumulee et non un merite.
 */
function comparer(a, b) {
  return (b.points || 0) - (a.points || 0)
      || (b.exacts || 0) - (a.exacts || 0)
      || (b.proches || 0) - (a.proches || 0)
      || (a.ecarts || 0) - (b.ecarts || 0)
      || String(a.username || '').localeCompare(String(b.username || ''));
}

/** Trie et numerote. Ne modifie pas la liste recue. */
function classer(lignes) {
  return [...lignes]
    .sort(comparer)
    .map((l, i) => ({ ...l, rank: i + 1 }));
}

/** En clair, pour l'afficher quelque part un jour. */
const CRITERES = [
  'les points',
  'le plus de scores exacts',
  'le plus de pronostics à 5 points près',
  'la plus petite somme d\'écarts',
];

module.exports = { ecart, stats, comparer, classer, CRITERES, DEPUIS, retenuAuClassement };
