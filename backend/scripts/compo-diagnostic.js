/**
 * Pourquoi tous les clubs changeraient quinze titulaires.
 *
 * ---------------------------------------------------------------------------
 * CE QU'ON CHERCHE
 * ---------------------------------------------------------------------------
 *
 * Le compteur de rotation annonce dix a quinze changements partout. C'est
 * impossible : un club fait tourner trois a cinq titulaires, huit ou neuf quand
 * il sacrifie un deplacement, jamais quinze — et surtout pas plusieurs clubs le
 * meme week-end.
 *
 * Donc ce n'est pas le rugby qui parle, c'est la donnee. Trois causes possibles,
 * et ce script les separe sans rien deviner :
 *
 *   1. L'identifiant n'est pas celui du joueur mais celui de la ligne de feuille
 *      de match — un numero cree a chaque publication. Deux feuilles n'en
 *      partagent alors aucun, et la comparaison rend mecaniquement 15.
 *
 *   2. L'ecriture des noms bouge d'une journee a l'autre (« GROS Jean-Baptiste »
 *      puis « Jean-Baptiste Gros », ou avec l'initiale seule). La normalisation
 *      actuelle — minuscules, sans accent — n'y suffit pas.
 *
 *   3. La composition stockee n'est pas celle qu'on croit : titulaires et
 *      remplacants melanges, ou ordre different, ou le quinze d'un seul camp.
 *
 * Le script ne corrige rien. Il montre, pour chaque club, ses deux dernieres
 * feuilles cote a cote et le compte de changements calcule de trois facons
 * differentes. Celle qui rend un chiffre credible designe le remede.
 *
 * ---------------------------------------------------------------------------
 * USAGE
 * ---------------------------------------------------------------------------
 *
 *   node scripts/compo-diagnostic.js
 *   node scripts/compo-diagnostic.js 6        (journee de reference)
 *   node scripts/compo-diagnostic.js 6 4      (et le nombre de clubs montres)
 *
 * Lecture seule. Aucune ecriture, aucune requete externe.
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const SEASON = process.env.SPORTSDB_SEASON || '2026-2027';

const ROUND = parseInt(process.argv[2] || '6', 10);
const COMBIEN = parseInt(process.argv[3] || '3', 10);

/* -------------------------------------------------------------------------- */
/* Les trois facons de reconnaitre un joueur                                  */
/* -------------------------------------------------------------------------- */

/** Celle du service actuel : l'identifiant d'abord, le nom en secours. */
const parId = (j) =>
  j?.id !== undefined && j?.id !== null && j?.id !== '' ? `#${j.id}` : nomNormalise(j);

/** Minuscules, sans accent, sans ponctuation. Ce que fait deja le service. */
function nomNormalise(j) {
  return String(j?.nom || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Le nom reduit a ses mots, tries.
 *
 * « GROS Jean-Baptiste » et « Jean-Baptiste Gros » donnent tous deux
 * « baptiste gros jean ». Survit a l'ordre prenom/nom et au trait d'union, ce
 * qui est exactement le genre de variation qu'une source change sans prevenir.
 */
function parMots(j) {
  return nomNormalise(j).split(' ').filter(Boolean).sort().join(' ');
}

/* -------------------------------------------------------------------------- */

const differents = (avant, apres, cle) => {
  const dedans = new Set(avant.map(cle).filter(Boolean));
  return apres.map(cle).filter(Boolean).filter((x) => !dedans.has(x)).length;
};

/** Les deux dernieres feuilles connues de chaque club, journee ROUND incluse. */
async function feuilles() {
  const matchs = await prisma.match.findMany({
    where: { season: SEASON, round: { lte: ROUND }, compositionAt: { not: null } },
    select: {
      id: true, round: true, kickoff: true,
      homeTeamId: true, awayTeamId: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      composition: true,
    },
    orderBy: [{ round: 'desc' }, { kickoff: 'desc' }],
  });

  const par = {};
  const pousse = (teamId, nom, round, camp) => {
    if (!camp?.titulaires?.length) return;
    par[teamId] = par[teamId] || { nom, feuilles: [] };
    if (par[teamId].feuilles.length < 2) par[teamId].feuilles.push({ round, camp });
  };

  for (const m of matchs) {
    pousse(m.homeTeamId, m.homeTeam?.name, m.round, m.composition?.home);
    pousse(m.awayTeamId, m.awayTeam?.name, m.round, m.composition?.away);
  }
  return par;
}

(async () => {
  console.log(`\nSaison ${SEASON} — diagnostic des compositions jusqu'a la J${ROUND}\n`);

  const par = await feuilles();
  const clubs = Object.entries(par).filter(([, v]) => v.feuilles.length === 2);

  if (!clubs.length) {
    console.log('Aucun club avec deux feuilles exploitables. Rien a diagnostiquer :');
    console.log('le probleme serait alors en amont, dans la collecte des compositions.\n');
    await prisma.$disconnect();
    return;
  }

  /* ---------------------------------------------------------------------- */
  /* 1. Les trois comptes, pour tous les clubs                              */
  /* ---------------------------------------------------------------------- */

  console.log('CHANGEMENTS DE TITULAIRES, SELON CE QU\'ON COMPARE');
  console.log('-'.repeat(68));
  console.log('club                        journees   par id   par nom   par mots');
  console.log('-'.repeat(68));

  const totaux = { id: 0, nom: 0, mots: 0, n: 0 };

  for (const [, v] of clubs) {
    const [apres, avant] = v.feuilles; // le plus recent en premier
    const a = avant.camp.titulaires.slice(0, 15);
    const b = apres.camp.titulaires.slice(0, 15);

    const c = {
      id: differents(a, b, parId),
      nom: differents(a, b, nomNormalise),
      mots: differents(a, b, parMots),
    };

    totaux.id += c.id; totaux.nom += c.nom; totaux.mots += c.mots; totaux.n++;

    console.log(
      `${String(v.nom || '?').padEnd(26).slice(0, 26)}  J${avant.round}→J${apres.round}` +
      `   ${String(c.id).padStart(5)}   ${String(c.nom).padStart(6)}   ${String(c.mots).padStart(7)}`
    );
  }

  console.log('-'.repeat(68));
  const moy = (x) => (x / totaux.n).toFixed(1);
  console.log(
    `moyenne sur ${totaux.n} clubs`.padEnd(26) + '             ' +
    `${moy(totaux.id).padStart(5)}   ${moy(totaux.nom).padStart(6)}   ${moy(totaux.mots).padStart(7)}`
  );

  console.log(`
Ce qu'il faut y lire :

  - la colonne « par id » proche de 15 et les autres raisonnables
      → l'identifiant est celui de la ligne de feuille, pas celui du joueur.
        Remede : comparer par le nom, et ignorer l'id.

  - les trois colonnes proches de 15
      → les noms eux-memes ne se correspondent pas d'une journee a l'autre.
        Le detail ci-dessous dira pourquoi.

  - « par nom » eleve mais « par mots » raisonnable
      → l'ordre prenom/nom ou le trait d'union change selon la publication.
        Remede : normaliser en mots tries.

  - les trois colonnes entre 2 et 6
      → la donnee est saine, et le compteur initial avait un autre defaut.
`);

  /* ---------------------------------------------------------------------- */
  /* 2. Le detail brut, sur quelques clubs                                  */
  /* ---------------------------------------------------------------------- */

  console.log('='.repeat(68));
  console.log('LES FEUILLES, TELLES QU\'ELLES SONT STOCKEES');
  console.log('='.repeat(68));
  console.log(`
Les quinze titulaires des deux dernieres feuilles, face a face, tries par
numero de maillot. On lit les noms en entier et les identifiants bruts : si les
memes hommes reviennent avec d'autres numeros, cela se voit a l'oeil nu, et
aucune heuristique ne le dira mieux.
`);

  for (const [, v] of clubs.slice(0, COMBIEN)) {
    const [apres, avant] = v.feuilles;
    console.log('-'.repeat(68));
    console.log(`${v.nom}  —  J${avant.round} a gauche, J${apres.round} a droite`);
    console.log('-'.repeat(68));

    const tri = (l) => [...l].slice(0, 15).sort((x, y) => (x.numero || 99) - (y.numero || 99));
    const a = tri(avant.camp.titulaires);
    const b = tri(apres.camp.titulaires);

    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const g = a[i], d = b[i];
      const cote = (j) =>
        j ? `${String(j.numero ?? '–').padStart(2)} ${String(j.nom || '?').slice(0, 20).padEnd(20)} ${String(j.id ?? '—').slice(0, 9).padStart(9)}`
          : ' '.repeat(33);
      console.log(`  ${cote(g)} | ${cote(d)}`);
    }

    // Les clefs des deux objets, au cas ou le nom du champ ne serait pas celui qu'on croit.
    const champs = (j) => (j ? Object.keys(j).join(', ') : '—');
    console.log(`\n  champs J${avant.round} : ${champs(a[0])}`);
    console.log(`  champs J${apres.round} : ${champs(b[0])}`);

    // Et le compte de remplacants, pour verifier qu'ils ne sont pas melanges aux titulaires.
    console.log(
      `  titulaires / remplacants : ` +
      `J${avant.round} ${avant.camp.titulaires.length}/${(avant.camp.remplacants || []).length}  ·  ` +
      `J${apres.round} ${apres.camp.titulaires.length}/${(apres.camp.remplacants || []).length}\n`
    );
  }

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('\nEchec :', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
