/**
 * Les series et les ecarts.
 *
 * Le classement general dit qui gagne. Il ne dit pas ce qui se passe — qu'un
 * joueur reste sur quatre bons pronostics d'affilee, ou qu'il ne lui manque que
 * deux points pour doubler son voisin. Or c'est cela qui donne envie de revenir
 * la semaine suivante, surtout quand l'ordre du classement s'est fige.
 *
 * Deux notions, et elles ne se ressemblent pas.
 *
 * La serie regarde en arriere : combien de pronostics de suite ont rapporte
 * quelque chose, ou combien sont tombes a cote. Elle se lit sur les pronostics
 * d'un seul joueur, dans l'ordre ou les matchs ont ete joues.
 *
 * L'ecart regarde de cote : combien de points separent de celui qui precede et
 * de celui qui suit. Il se lit sur le classement, pas sur les pronostics.
 *
 * Tout ce qui compte ici est ecrit en fonctions pures, testables sans base :
 * `serieDe` prend une liste de pronostics et rend deux nombres, `avecEcarts`
 * prend un classement et rend le meme avec deux champs de plus. Le reste n'est
 * que lecture en base.
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/** Seuil a partir duquel une serie merite d'etre annoncee. */
const SERIE_MINI = 3;

/**
 * Le bareme seul, de 0 a 3, jamais le total multiplie.
 *
 * Une serie compte des pronostics reussis, pas des points : un bon vainqueur
 * joue en joker vaut quatre points et reste un seul bon pronostic. Le repli sur
 * `points` couvre les pronostics d'avant les multiplicateurs, dont `basePoints`
 * est nul.
 */
const bareme = (p) => (p.basePoints ?? p.points);

/**
 * La serie en cours et le record de la saison.
 *
 * `pronos` doit arriver dans l'ordre ou les matchs ont ete joues — c'est a
 * l'appelant de le garantir, une serie etant par definition une question
 * d'ordre. La fonction ne trie pas elle-meme : elle n'a pas les dates, et lui
 * demander de deviner l'ordre serait lui demander de deviner la reponse.
 *
 * Un pronostic non note (match reporte, points pas encore calcules) est ignore
 * plutot que de casser la serie : il n'apprend rien, et le compter comme un
 * echec punirait quelqu'un pour un match qui ne s'est pas joue.
 *
 * Rend `{ type, longueur, record }` ou `type` vaut 'bon' ou 'rate'. Sur une
 * liste vide, longueur zero et type nul — et surtout pas 'rate', qui annoncerait
 * une serie de defaites a quelqu'un qui n'a simplement pas encore joue.
 */
function serieDe(pronos) {
  let type = null;
  let longueur = 0;
  let record = 0;
  let courante = 0;
  let typeCourant = null;

  for (const p of pronos) {
    const b = bareme(p);
    if (b === null || b === undefined) continue;

    const t = b > 0 ? 'bon' : 'rate';
    if (t === typeCourant) courante += 1;
    else { typeCourant = t; courante = 1; }

    if (t === 'bon' && courante > record) record = courante;

    type = typeCourant;
    longueur = courante;
  }

  return { type, longueur, record };
}

/**
 * Les ecarts avec le voisin du dessus et celui du dessous.
 *
 * Les joueurs en pause sont ignores : ils n'ont pas de rang, donc ni voisin ni
 * ecart. Les compter reviendrait a dire « tu devances Christian de 2 points »
 * a propos de quelqu'un qui ne joue plus.
 *
 * `devant` est celui qu'on peut doubler, `derriere` celui qui peut nous
 * doubler. Le premier du classement n'a pas de `devant`, le dernier pas de
 * `derriere` — et les champs valent alors `null` plutot que zero, qui voudrait
 * dire « a egalite ».
 */
function avecEcarts(classement) {
  const classes = classement.filter((l) => !l.enPause && Number.isFinite(l.rank));
  const parRang = [...classes].sort((a, b) => a.rank - b.rank);
  const index = new Map(parRang.map((l, i) => [l.id, i]));

  const points = (l) => l.totalPoints ?? l.points ?? 0;

  return classement.map((l) => {
    const i = index.get(l.id);
    if (i === undefined) return { ...l, devant: null, derriere: null };

    const dessus = parRang[i - 1];
    const dessous = parRang[i + 1];

    return {
      ...l,
      devant: dessus
        ? { username: dessus.username, ecart: points(dessus) - points(l) }
        : null,
      derriere: dessous
        ? { username: dessous.username, ecart: points(l) - points(dessous) }
        : null,
    };
  });
}

/**
 * Les phrases a afficher, de la plus interessante a la moins.
 *
 * Elles sont fabriquees ici, une seule fois, et non dans chaque ecran : la page
 * d'accueil, le classement et le bilan du lundi doivent dire la meme chose des
 * memes chiffres. Trois formulations d'une meme regle finissent toujours par
 * diverger — on l'a deja vu avec le departage.
 *
 * On ne dit rien plutot que de dire une banalite. Une serie de deux n'est pas
 * une serie, un ecart avec personne n'est pas un ecart, et une rubrique remplie
 * de force avec du vide se demasque en deux semaines et n'est plus lue.
 */
function phrases(ligne, { pourSoi = true } = {}) {
  const tu = pourSoi;
  const sortie = [];
  const s = ligne.serie;

  if (s && s.longueur >= SERIE_MINI) {
    if (s.type === 'bon') {
      sortie.push(
        tu
          ? `${s.longueur} bons pronostics de suite — ne change rien.`
          : `${s.longueur} bons pronostics de suite`
      );
    } else {
      sortie.push(
        tu
          ? `${s.longueur} pronostics ratés d'affilée. Ça va finir par tourner.`
          : `${s.longueur} pronostics ratés d'affilée`
      );
    }
  }

  if (ligne.devant) {
    const e = ligne.devant.ecart;
    sortie.push(
      e === 0
        ? (tu ? `Tu es à égalité avec ${ligne.devant.username}.` : `à égalité avec ${ligne.devant.username}`)
        : (tu
          ? `${e} point${e > 1 ? 's' : ''} te sépare${e > 1 ? 'nt' : ''} de ${ligne.devant.username}.`
          : `${e} point${e > 1 ? 's' : ''} derrière ${ligne.devant.username}`)
    );
  } else if (ligne.derriere && ligne.derriere.ecart > 0) {
    const e = ligne.derriere.ecart;
    sortie.push(
      tu
        ? `Tu mènes, avec ${e} point${e > 1 ? 's' : ''} d'avance sur ${ligne.derriere.username}.`
        : `${e} point${e > 1 ? 's' : ''} d'avance`
    );
  }

  return sortie;
}

/**
 * Les series de tous les joueurs, lues en base.
 *
 * Une seule requete pour tout le monde plutot qu'une par joueur : a cinq c'est
 * sans importance, mais la requete par joueur dans une boucle est la facon la
 * plus sure de rendre une page lente sans s'en apercevoir tant qu'on est peu
 * nombreux.
 *
 * L'ordre est celui des coups d'envoi, pas celui des journees : quand une
 * rencontre est reportee, elle se joue a sa vraie date et la serie doit suivre
 * ce qui s'est passe, pas le calendrier prevu.
 */
async function pourTous({ season = process.env.SPORTSDB_SEASON || '2026-2027' } = {}) {
  const pronos = await prisma.prediction.findMany({
    where: { match: { season, status: 'FINISHED' } },
    select: {
      userId: true,
      points: true,
      basePoints: true,
      match: { select: { kickoff: true } },
    },
    orderBy: { match: { kickoff: 'asc' } },
  });

  const parJoueur = new Map();
  for (const p of pronos) {
    if (!parJoueur.has(p.userId)) parJoueur.set(p.userId, []);
    parJoueur.get(p.userId).push(p);
  }

  const sortie = new Map();
  for (const [userId, liste] of parJoueur) sortie.set(userId, serieDe(liste));
  return sortie;
}

module.exports = { SERIE_MINI, serieDe, avecEcarts, phrases, pourTous };
