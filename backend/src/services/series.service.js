/**
 * Les series de journees gagnees.
 *
 * Le classement general dit qui mene. Il ne dit pas ce qui se passe — qu'un
 * joueur vient de rafler la journee, ou qu'il en gagne trois d'affilee. Or
 * c'est cela qui donne envie de revenir la semaine suivante, surtout quand
 * l'ordre du classement s'est fige.
 *
 * ---------------------------------------------------------------------------
 * Pourquoi la journee, et non le pronostic
 * ---------------------------------------------------------------------------
 *
 * La premiere version comptait les bons pronostics d'affilee, a partir de
 * trois. C'etait une fausse bonne idee, et le calcul le montre : un bon
 * vainqueur rapporte des qu'on trouve le bon gagnant, ce qui arrive environ
 * deux fois sur trois. Avec sept matchs par journee, enchainer trois bons
 * pronostics n'est pas une performance, c'est ce qui se produit presque toutes
 * les semaines. On annoncait donc comme un exploit quelque chose d'automatique,
 * et une rubrique qui dit une banalite cesse d'etre lue en deux semaines.
 *
 * L'erreur etait dans l'unite choisie, pas seulement dans le seuil. L'unite de
 * ce jeu est la journee : on la gagne ou on ne la gagne pas, une fois par
 * semaine, contre les autres. Une serie de journees gagnees est rare sans etre
 * exceptionnelle, et elle se raconte au comptoir.
 *
 * L'ecart avec le voisin de classement a disparu avec elle. « Deux points te
 * separent de Christian » ne disait pas dans quel sens, et le classement, lui,
 * le montre d'un coup d'oeil — c'est son travail, pas celui d'une phrase.
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Les vainqueurs de chaque journee terminee, dans l'ordre des journees.
 *
 * Fonction pure : elle prend des pronostics deja notes et rend un tableau. Elle
 * ne lit rien, ne suppose rien de la base, et se teste avec cinq lignes.
 *
 * Deux choix qui meritent d'etre dits. Une egalite en tete fait plusieurs
 * vainqueurs, comme dans le bilan du lundi : on ne tranche pas en silence ce
 * que le jeu n'a pas tranche. Et une journee ou personne n'a marque n'a aucun
 * vainqueur — elle casse donc les series en cours, ce qui est juste : personne
 * ne l'a gagnee.
 *
 * On somme `points`, le total multiplie, et non le bareme : le joker fait
 * partie du jeu, et celui qui l'a bien place a gagne sa journee pour de bon.
 */
function vainqueursParJournee(pronos) {
  const parRonde = new Map();

  for (const p of pronos) {
    const round = p.round ?? p.match?.round;
    if (!Number.isFinite(round)) continue;
    if (!parRonde.has(round)) parRonde.set(round, new Map());
    const total = parRonde.get(round);
    total.set(p.userId, (total.get(p.userId) || 0) + (p.points || 0));
  }

  return [...parRonde.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([round, totaux]) => {
      let meilleur = 0;
      for (const v of totaux.values()) if (v > meilleur) meilleur = v;

      const gagnants = meilleur > 0
        ? [...totaux.entries()].filter(([, v]) => v === meilleur).map(([id]) => id)
        : [];

      return { round, meilleur, gagnants };
    });
}

/**
 * La serie de journees gagnees d'un joueur, en remontant depuis la derniere.
 *
 * Zero des qu'il n'a pas gagne la derniere journee terminee : une serie est en
 * cours ou elle n'existe pas. Celle de la semaine derniere, interrompue depuis,
 * n'interesse personne — et surtout pas celui a qui on la rappellerait.
 *
 * Rend `{ longueur, derniereJournee }`. La journee sert a l'affichage : « tu as
 * gagne la J4 » est plus concret que « tu as gagne la derniere journee ».
 */
function serieDe(journees, userId) {
  let longueur = 0;
  let derniereJournee = null;

  for (let i = journees.length - 1; i >= 0; i--) {
    const j = journees[i];
    if (!j.gagnants.includes(userId)) break;
    if (longueur === 0) derniereJournee = j.round;
    longueur += 1;
  }

  return { longueur, derniereJournee };
}

/**
 * Ce qu'on affiche, de la phrase la plus forte a rien du tout.
 *
 * Fabriquee ici, une seule fois : la page d'accueil, le classement et le bilan
 * du lundi doivent dire la meme chose des memes chiffres. Trois formulations
 * d'une meme regle finissent toujours par diverger — on l'a deja vu avec le
 * departage.
 *
 * Rien ne s'affiche quand il n'y a rien a dire. C'est le point le plus
 * important de cette fonction : une rubrique remplie de force avec une banalite
 * se demasque en deux semaines et n'est plus lue, ce qui coute aussi les fois
 * ou elle avait quelque chose a dire.
 */
function phrases(ligne, { pourSoi = true } = {}) {
  const s = ligne?.serie;
  if (!s || !s.longueur) return [];

  if (s.longueur === 1) {
    return [
      pourSoi
        ? `Tu as gagné la journée ${s.derniereJournee}.`
        : `Vainqueur de la journée ${s.derniereJournee}`,
    ];
  }

  return [
    pourSoi
      ? `${s.longueur} journées gagnées d'affilée. Ça commence à se voir.`
      : `${s.longueur} journées gagnées d'affilée`,
  ];
}

/**
 * Les series de tous les joueurs, lues en base.
 *
 * Une seule requete pour tout le monde plutot qu'une par joueur : a huit c'est
 * sans importance, mais la requete par joueur dans une boucle est la facon la
 * plus sure de rendre une page lente sans s'en apercevoir tant qu'on est peu
 * nombreux.
 *
 * Seules les rencontres terminees comptent : une journee en cours n'a pas
 * encore de vainqueur, et l'annoncer a la mi-temps du dernier match serait le
 * meilleur moyen de se dedire une heure plus tard.
 */
async function pourTous({ season = process.env.SPORTSDB_SEASON || '2026-2027' } = {}) {
  const pronos = await prisma.prediction.findMany({
    where: { match: { season, status: 'FINISHED' } },
    select: { userId: true, points: true, match: { select: { round: true } } },
  });

  const journees = vainqueursParJournee(pronos);

  const sortie = new Map();
  for (const userId of new Set(pronos.map((p) => p.userId))) {
    sortie.set(userId, serieDe(journees, userId));
  }
  return sortie;
}

module.exports = { vainqueursParJournee, serieDe, phrases, pourTous };
