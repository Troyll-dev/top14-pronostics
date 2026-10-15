const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const SEASON = process.env.SPORTSDB_SEASON || '2026-2027';

/**
 * Combien de changements depuis la derniere composition du club.
 *
 * ---------------------------------------------------------------------------
 * LE BESOIN
 * ---------------------------------------------------------------------------
 *
 * « Parfois les equipes viennent avec une equipe bis a l'exterieur. » C'est
 * l'information la plus utile des compositions, et c'est la seule qu'on ne
 * pouvait pas en tirer : il fallait lire quarante-six noms et se souvenir de
 * ceux de la semaine passee.
 *
 * Un club qui change neuf titulaires pour un deplacement a huit cents
 * kilometres annonce son intention. Le chiffre le dit en trois mots.
 *
 * ---------------------------------------------------------------------------
 * CE QU'ON COMPARE, ET CE QU'ON NE COMPARE PAS
 * ---------------------------------------------------------------------------
 *
 * Les quinze titulaires, et eux seuls. Le banc change beaucoup d'une semaine a
 * l'autre sans que cela signifie quoi que ce soit — un remplacant qui n'entre
 * pas n'a pas joue, et le compter ferait du bruit par-dessus le signal.
 *
 * On compare des ensembles, pas des numeros : un joueur qui passe de pilier
 * droit a pilier gauche n'est pas un changement, alors qu'une comparaison poste
 * par poste en verrait deux. Ce qui nous interesse est « combien d'hommes
 * differents », pas « combien de cases ont bouge ».
 *
 * L'identite d'un joueur est son identifiant quand la source en fournit un, et
 * sinon son nom normalise — minuscules, sans accent, espaces reduits. C'est la
 * seule facon de survivre a un « Jean-Baptiste Gros » devenu « Jean Baptiste
 * Gros » entre deux feuilles de match, et la normalisation est la meme que
 * partout ailleurs dans le projet.
 *
 * ---------------------------------------------------------------------------
 * LA LIMITE
 * ---------------------------------------------------------------------------
 *
 * La reference est la **derniere rencontre dont on possede la composition**,
 * pas forcement celle de la journee precedente : la LNR publie parfois en
 * retard, et une journee peut manquer. Le resultat porte donc toujours la
 * journee de reference — « 9 changements depuis la J6 » — plutot qu'un vague
 * « depuis la derniere fois » qui laisserait croire a une continuite qui
 * n'existe pas.
 *
 * Et un club qui n'a aucune composition anterieure ne rend rien du tout. Pas de
 * zero, qui se lirait « equipe inchangee » et serait faux.
 */

const normaliser = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** L'identite d'un joueur : son identifiant s'il en a un, sinon son nom. */
const identite = (j) =>
  j?.id !== undefined && j?.id !== null && j?.id !== ''
    ? `#${j.id}`
    : normaliser(j?.nom);

/** Les quinze titulaires d'un camp, en identites. */
function titulaires(camp) {
  const liste = camp?.titulaires || [];
  return liste.map(identite).filter(Boolean);
}

/**
 * Le nombre de titulaires differents entre deux compositions.
 *
 * Rend `null` si l'une des deux n'est pas exploitable — moins de quinze noms,
 * ou des identites vides. Un chiffre faux serait pire que pas de chiffre :
 * personne ne va verifier, et « 2 changements » sur une equipe entierement
 * remaniee tromperait exactement la personne qu'on veut aider.
 */
function comparer(avant, apres) {
  const a = titulaires(avant);
  const b = titulaires(apres);
  if (a.length < 15 || b.length < 15) return null;

  const dedans = new Set(a);
  const differents = b.filter((x) => !dedans.has(x)).length;
  return { changements: differents, sur: b.length };
}

/**
 * Pour chaque club, sa derniere composition connue avant une journee donnee.
 *
 * Une seule requete pour toute la journee affichee : les compositions des
 * journees anterieures, de la plus recente a la plus ancienne, et l'on garde la
 * premiere rencontree pour chaque club. Sept cartes demanderaient sinon
 * quatorze requetes a elles seules.
 */
async function dernieresCompos({ season = SEASON, avantRound }) {
  const matchs = await prisma.match.findMany({
    where: {
      season,
      round: { lt: avantRound },
      compositionAt: { not: null },
    },
    select: {
      round: true, homeTeamId: true, awayTeamId: true, composition: true,
    },
    orderBy: [{ round: 'desc' }, { kickoff: 'desc' }],
  });

  const par = {};
  const garde = (teamId, round, camp) => {
    if (!par[teamId] && camp?.titulaires?.length) {
      par[teamId] = { round, camp };
    }
  };

  for (const m of matchs) {
    garde(m.homeTeamId, m.round, m.composition?.home);
    garde(m.awayTeamId, m.round, m.composition?.away);
  }

  return par;
}

/**
 * La rotation de chaque club d'une journee, prete a afficher.
 *
 * Rend, par identifiant de rencontre, `{ home, away }` ou chaque cote vaut soit
 * `null` — rien de comparable — soit `{ changements, sur, depuis }`.
 */
async function rotations({ season = SEASON, round }) {
  if (!Number.isFinite(round)) return {};

  const [precedentes, duJour] = await Promise.all([
    dernieresCompos({ season, avantRound: round }),
    prisma.match.findMany({
      where: { season, round, compositionAt: { not: null } },
      select: { id: true, homeTeamId: true, awayTeamId: true, composition: true },
    }),
  ]);

  const sortie = {};
  for (const m of duJour) {
    const cote = (teamId, camp) => {
      const ref = precedentes[teamId];
      if (!ref) return null;
      const r = comparer(ref.camp, camp);
      return r ? { ...r, depuis: ref.round } : null;
    };

    sortie[m.id] = {
      home: cote(m.homeTeamId, m.composition?.home),
      away: cote(m.awayTeamId, m.composition?.away),
    };
  }

  return sortie;
}

module.exports = { rotations, dernieresCompos, comparer, identite, normaliser, SEASON };
