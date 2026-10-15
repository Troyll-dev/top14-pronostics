/**
 * Les compositions sont-elles attribuees au bon club ?
 *
 * ---------------------------------------------------------------------------
 * CE QU'ON A VU
 * ---------------------------------------------------------------------------
 *
 * A la J6, le quinze range sous « Stade Rochelais » est celui de Lyon, et celui
 * range sous « LOU Rugby » est celui de La Rochelle. Les deux clubs se sont
 * rencontres ce jour-la : leurs compositions sont interverties.
 *
 * Deux rencontres lues a la main ne font pas une regle. Ce script les lit
 * toutes, et pour chacune repond par oui ou par non.
 *
 * ---------------------------------------------------------------------------
 * COMMENT ON TRANCHE SANS CONNAITRE LES EFFECTIFS
 * ---------------------------------------------------------------------------
 *
 * On ne dispose d'aucune liste officielle « ce joueur appartient a ce club », et
 * en constituer une a la main pour quatorze clubs serait long et faux au premier
 * transfert.
 *
 * Mais on n'en a pas besoin. Un club se reconnait a lui-meme d'une journee a
 * l'autre : entre deux feuilles d'un meme club, dix a douze titulaires sont les
 * memes. Entre deux clubs differents, zero.
 *
 * Donc, pour chaque rencontre, on prend les deux compositions et on regarde
 * laquelle ressemble le plus a ce que le club recevant alignait la fois
 * precedente. Si c'est le camp « home », tout va bien. Si c'est le camp
 * « away », les camps sont inverses. Et si aucun des deux ne ressemble a rien,
 * on le dit plutot que de choisir au hasard.
 *
 * La mesure est le nombre de titulaires communs. Elle ne depend d'aucun seuil
 * arbitraire : l'ecart entre les deux hypotheses est enorme — une dizaine contre
 * zero — et un depart serre serait en soi l'information qu'il se passe autre
 * chose.
 *
 * ---------------------------------------------------------------------------
 * USAGE
 * ---------------------------------------------------------------------------
 *
 *   node scripts/compo-inversion.js        (toutes les journees connues)
 *   node scripts/compo-inversion.js 6      (une seule)
 *
 * Lecture seule. Aucune ecriture.
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const SEASON = process.env.SPORTSDB_SEASON || '2026-2027';
const ROUND = process.argv[2] ? parseInt(process.argv[2], 10) : null;

const normaliser = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const noms = (camp) =>
  (camp?.titulaires || []).slice(0, 15).map((j) => normaliser(j?.nom)).filter(Boolean);

const communs = (a, b) => {
  const dedans = new Set(a);
  return b.filter((x) => dedans.has(x)).length;
};

(async () => {
  const where = { season: SEASON, compositionAt: { not: null } };
  if (ROUND) where.round = ROUND;

  const matchs = await prisma.match.findMany({
    where,
    select: {
      id: true, round: true, kickoff: true,
      homeTeamId: true, awayTeamId: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      composition: true,
    },
    orderBy: [{ round: 'asc' }, { kickoff: 'asc' }],
  });

  console.log(`\nSaison ${SEASON} — ${matchs.length} rencontres avec composition\n`);

  /*
   * Memoire des quinze deja vus, par club.
   *
   * On avance dans l'ordre chronologique et on retient, pour chaque club, le
   * dernier quinze qu'on lui a attribue APRES correction. Se fier au rangement
   * brut reviendrait a comparer des erreurs entre elles.
   */
  const dernier = {};
  const compte = { endroit: 0, envers: 0, indecis: 0, premiere: 0 };

  for (const m of matchs) {
    const h = noms(m.composition?.home);
    const a = noms(m.composition?.away);
    const nomH = String(m.homeTeam?.name || '?').slice(0, 22);
    const nomA = String(m.awayTeam?.name || '?').slice(0, 22);

    if (h.length < 15 || a.length < 15) {
      console.log(`J${m.round}  ${nomH.padEnd(22)} ${nomA.padEnd(22)}  composition incomplete`);
      continue;
    }

    // Ce que chaque club alignait la derniere fois, tel qu'on l'a etabli.
    const refH = dernier[m.homeTeamId];
    const refA = dernier[m.awayTeamId];

    // Deux hypotheses, deux scores de ressemblance.
    const endroit = (refH ? communs(refH, h) : 0) + (refA ? communs(refA, a) : 0);
    const envers = (refH ? communs(refH, a) : 0) + (refA ? communs(refA, h) : 0);

    let verdict, vraiH, vraiA;
    if (!refH && !refA) {
      verdict = 'premiere feuille des deux clubs — rien a comparer';
      compte.premiere++;
      vraiH = h; vraiA = a;
    } else if (endroit === 0 && envers === 0) {
      verdict = 'AUCUNE ressemblance dans un sens ni dans l\'autre';
      compte.indecis++;
      vraiH = h; vraiA = a;
    } else if (envers > endroit) {
      verdict = `INVERSE  (a l'envers ${envers} communs contre ${endroit})`;
      compte.envers++;
      vraiH = a; vraiA = h;
    } else {
      verdict = `correct  (a l'endroit ${endroit} communs contre ${envers})`;
      compte.endroit++;
      vraiH = h; vraiA = a;
    }

    dernier[m.homeTeamId] = vraiH;
    dernier[m.awayTeamId] = vraiA;

    console.log(`J${m.round}  ${nomH.padEnd(22)} ${nomA.padEnd(22)}  ${verdict}`);
  }

  console.log(`
--------------------------------------------------------------------
  a l'endroit  : ${compte.endroit}
  inversees    : ${compte.envers}
  indecises    : ${compte.indecis}
  premieres    : ${compte.premiere}   (aucun point de comparaison)
--------------------------------------------------------------------

  Tout inverse        → le defaut est dans la collecte, et une seule ligne
                        le corrige. Les donnees deja en base restent a
                        remettre a l'endroit.

  Inversions melees   → le defaut depend de la source ou de la rencontre.
                        Il faudra voir le code de collecte avant de toucher
                        a quoi que ce soit.

  Beaucoup d'indecis  → les quinze ne se ressemblent pas d'une journee a
                        l'autre meme pour un club donne, et l'inversion
                        n'est pas la seule chose qui cloche.
`);

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('\nEchec :', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
