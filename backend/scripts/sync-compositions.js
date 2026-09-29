/**
 * Lit les compositions des rencontres a venir, a la main.
 *
 *   node scripts/sync-compositions.js                 simulation, rien n'est ecrit
 *   node scripts/sync-compositions.js --force         ecrit en base
 *   node scripts/sync-compositions.js --round 5       une journee precise
 *   node scripts/sync-compositions.js --round 5 --force
 *
 * La simulation est le mode par defaut, et elle affiche les quinze noms : c'est
 * ce qui permet de verifier a l'oeil qu'on n'a pas interverti les deux camps
 * avant d'ecrire quoi que ce soit.
 */

const { syncCompositions } = require('../src/services/composition-sync.service');

const args = process.argv.slice(2);
const force = args.includes('--force');
const iRound = args.indexOf('--round');
const rounds = iRound >= 0 && args[iRound + 1] ? [Number(args[iRound + 1])] : null;

/**
 * La largeur maximale de la colonne de gauche.
 *
 * Au-dela, on coupe. C'est arbitraire, mais il faut bien une borne : sans elle,
 * un seul nom a rallonge — les compositions en portent, prenom compose et
 * particule comprises — ecarterait la colonne de droite sur la ligne ou il se
 * trouve, et sur elle seule. Le resultat n'est pas une colonne large, c'est une
 * colonne qui ondule.
 */
const LARGEUR_MAX = 34;

/**
 * Une case de tableau : completee si elle est courte, coupee si elle est longue.
 *
 * `padEnd` ne faisait que la moitie du travail. Il complete, il ne tronque
 * jamais — c'est ecrit noir sur blanc dans sa documentation, et c'est pourtant
 * la faute qu'on refait, parce qu'on lit « pad to length » comme « mettre a
 * cette longueur ». Sur des noms qui tiennent presque tous dans la largeur, le
 * defaut ne se voit que sur une ligne de temps en temps, ce qui est la
 * meilleure facon de ne jamais le corriger.
 *
 * Le caractere de coupure est un vrai signe, pas trois points colles : il dit
 * « il en manque » au lieu de laisser croire a un nom qui finirait bizarrement.
 *
 * `normalize('NFC')` avant de mesurer : un « é » peut arriver en deux
 * caracteres — la lettre puis l'accent — et compte alors double dans `length`
 * alors qu'il n'occupe qu'une colonne a l'ecran. Sans cette ligne, chaque nom
 * accentue decalerait la colonne de droite d'un cran vers la gauche.
 *
 * Enfin, la derniere colonne est reservee a la separation et ne peut pas etre
 * mangee par le texte. Ma premiere version tronquait bien, mais laissait un nom
 * de la largeur exacte coller au camp d'en face — « Kubriashvili-Dupont3
 * Jaminet », deux equipes soudees sur une ligne et une seule. Une colonne n'est
 * pas une largeur de texte, c'est une largeur de texte plus l'espace qui la
 * separe de la suivante.
 */
function case_(texte, largeur = LARGEUR_MAX) {
  const t = String(texte || '').normalize('NFC');
  const utile = Math.max(1, largeur - 1);
  if (t.length > utile) return t.slice(0, utile - 1) + '…' + ' ';
  return t.padEnd(utile) + ' ';
}

/**
 * La largeur reellement utile pour une rencontre.
 *
 * On prend le plus long nom du camp de gauche, plus deux espaces de respiration,
 * sans depasser le plafond. Une rencontre dont les noms sont tous courts n'etale
 * donc pas trente-quatre colonnes de vide entre les deux equipes.
 */
function largeurUtile(noms) {
  const plusLong = noms.reduce(
    (max, n) => Math.max(max, String(n || '').normalize('NFC').length),
    0
  );
  return Math.min(LARGEUR_MAX, plusLong + 2);
}

(async () => {
  const r = await syncCompositions({ dryRun: !force, rounds });

  console.log('');
  console.log(force ? '=== ECRITURE ===' : '=== SIMULATION (aucune ecriture) ===');
  console.log('Journees :', r.rounds.join(', ') || '(aucune)');
  for (const [k, v] of Object.entries(r.sources)) console.log(`  ${k} : ${v}`);
  if (r.reason) console.log(r.reason);

  for (const a of r.apercus) {
    console.log('');
    console.log(`--- ${a.match}${a.arbitre ? `   arbitre : ${a.arbitre}` : ''}`);
    const n = Math.max(a.home.length, a.away.length);
    const largeur = largeurUtile(a.home);
    for (let i = 0; i < n; i++) {
      console.log(`  ${case_(a.home[i], largeur)}${(a.away[i] || '').normalize('NFC')}`);
    }
  }

  console.log('');
  for (const c of r.changes) console.log(`  ${c}`);
  for (const u of r.unmatched) console.log(`  ! ${u}`);
  console.log('');
  console.log(
    `${r.updated} composition(s) ${force ? 'ecrite(s)' : 'a ecrire'}, ` +
    `${r.skipped} inchangee(s), ${r.enAttente} pas encore publiee(s)`
  );
  if (!r.ok) console.log('Des erreurs ont ete rencontrees : relire les lignes ci-dessus.');

  process.exit(r.ok ? 0 : 1);
})().catch((err) => {
  console.error('ECHEC :', err.message);
  process.exit(1);
});
