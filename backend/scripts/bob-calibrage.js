/**
 * Les scores de Bob sont-ils mal reglés ? — mesure du biais et de l'amplitude.
 *
 *   node scripts/bob-calibrage.js
 *
 * A lancer depuis `backend/`, comme le backtest. Ne modifie rien, n'ecrit nulle
 * part, n'envoie aucun courriel : il lit la base et imprime trois tableaux.
 *
 * ---------------------------------------------------------------------------
 * CE QUE CE SCRIPT CHERCHE, ET POURQUOI C'EST LA DERNIERE PISTE
 * ---------------------------------------------------------------------------
 *
 * La mesure precedente a ferme une question : sur le choix du vainqueur, il n'y
 * a rien a gagner. Le lieu du match decide a 71 %, Bob est a 66 %, les copains
 * a 71 %, et aucune strategie — classement, Elo, planchers — ne depasse « le
 * receveur gagne ». Un modele plus savant ne ferait que retrouver le terrain par
 * un chemin plus long.
 *
 * Il reste un gisement, et un seul : la barre des 2 points, celle du bon
 * vainqueur a cinq points pres des deux cotes. Les joueurs l'ont touchee 9 fois
 * sur 144 pronostics, Bob 3 fois sur 35. C'est le seul endroit du bareme ou il
 * reste de la place, et l'atteindre ne demande pas de mieux choisir le vainqueur
 * mais de mieux viser le niveau des deux scores.
 *
 * ---------------------------------------------------------------------------
 * LES DEUX REGLAGES, ET POURQUOI ILS NE PEUVENT RIEN CASSER
 * ---------------------------------------------------------------------------
 *
 * Ajouter la meme constante aux deux scores ne change pas le signe de leur
 * ecart. Ecarter les deux scores d'un facteur positif autour de leur moyenne
 * non plus. Dans les deux cas le vainqueur designe reste exactement le meme,
 * donc le taux de 66 % est intact au match pres — et le script le verifie
 * plutot que de le promettre.
 *
 * Tout ce que ces reglages peuvent faire, c'est rapprocher les scores annonces
 * des scores reels. Ils gagnent des 2 points sans pouvoir en perdre un seul.
 * C'est la seule famille d'ameliorations gratuite par construction, et c'est ce
 * qui la rend interessante quand tout le reste est au plafond.
 *
 *   NIVEAU (d)    — Bob annonce-t-il trop bas ou trop haut ? Un seul chiffre,
 *                   ajoute aux deux scores.
 *
 *   AMPLITUDE (k) — Bob annonce-t-il des matchs trop serres ? Sa formule est une
 *                   moyenne de moyennes : elle ecrase tout vers le score median
 *                   du championnat. Il doit donc predire des 25-22 la ou les
 *                   rencontres se terminent en 34-13. Le facteur k ecarte ses
 *                   deux scores autour de leur moyenne.
 *
 * Le score corrige est : moyenne + k x (ecart a la moyenne) + d, de chaque cote.
 *
 * ---------------------------------------------------------------------------
 * LA REGLE D'HONNETETE, LA MEME QU'AU BACKTEST
 * ---------------------------------------------------------------------------
 *
 * Pour pronostiquer la journee 5 on ne se sert que des journees 1 a 4 — et cela
 * vaut aussi pour les deux constantes. Les ajuster sur la saison entiere puis
 * rejouer la saison avec serait l'erreur classique : on mesurerait la capacite
 * du reglage a decrire le passe, pas a predire. Elles sont donc recalculees
 * avant chaque journee, sur les seules rencontres anterieures, exactement comme
 * les moyennes des clubs.
 *
 * Conséquence a lire sans s'inquieter : les premieres journees mesurees ont peu
 * de matieres pour l'ajustement, donc des constantes instables. C'est la
 * realite de l'exercice, pas un defaut du script.
 */

const { PrismaClient } = require('@prisma/client');
const bob = require('../src/services/bob.service');

const prisma = new PrismaClient();

const ECART_PROCHE = 5;
const vainqueur = (h, a) => (h > a ? 'dom' : a > h ? 'ext' : 'nul');

function points(predH, predA, reelH, reelA) {
  if (predH === reelH && predA === reelA) return 3;
  if (vainqueur(predH, predA) !== vainqueur(reelH, reelA)) return 0;
  const proche =
    Math.abs(predH - reelH) <= ECART_PROCHE && Math.abs(predA - reelA) <= ECART_PROCHE;
  return proche ? 2 : 1;
}

/** Les moyennes des clubs, calculees sur les rencontres fournies. */
function moyennes(matchs) {
  const acc = {};
  const init = () => ({ n: 0, pour: 0, contre: 0 });
  for (const m of matchs) {
    const d = (acc[m.homeTeamId] ||= init());
    const e = (acc[m.awayTeamId] ||= init());
    d.n++; d.pour += m.homeScore; d.contre += m.awayScore;
    e.n++; e.pour += m.awayScore; e.contre += m.homeScore;
  }
  const stats = {};
  for (const [id, a] of Object.entries(acc)) {
    stats[id] = {
      joues: a.n,
      pointsPourParMatch: a.n ? a.pour / a.n : null,
      pointsContreParMatch: a.n ? a.contre / a.n : null,
    };
  }
  return stats;
}

/** Bob tel qu'il est aujourd'hui, sans l'alea. */
function pronoBob(sd, se) {
  const { home, away } = bob.estimation({ dom: sd, ext: se });
  return [home, away];
}

/**
 * Les deux constantes, ajustees sur un lot de rencontres.
 *
 * `d` est la difference moyenne de niveau : ce qu'il faut ajouter aux deux
 * scores de Bob pour qu'en moyenne il vise juste.
 *
 * `k` est le facteur de moindres carres entre l'ecart predit et l'ecart reel —
 * c'est-a-dire, en clair, « quand Bob annonce un ecart de 3 points, l'ecart
 * reel vaut en general combien ? ». Un k de 2 veut dire qu'il faut doubler ses
 * ecarts ; un k de 1 qu'il vise deja juste ; un k inferieur a 1 qu'il exagere,
 * ce qui serait surprenant.
 *
 * k est borne entre 0,5 et 4. La borne basse interdit a l'ajustement d'inverser
 * ou d'annuler un ecart — ce qui changerait le vainqueur, et ces reglages ne
 * doivent jamais pouvoir le faire. La borne haute evite qu'une poignee de
 * matchs a gros ecart dans les premieres journees ne produise un facteur de 12.
 */
function ajuster(echantillon) {
  if (!echantillon.length) return { d: 0, k: 1, n: 0 };

  let sommeNiveau = 0;
  let numerateur = 0;
  let denominateur = 0;

  for (const e of echantillon) {
    const moyPred = (e.predH + e.predA) / 2;
    const moyReel = (e.reelH + e.reelA) / 2;
    sommeNiveau += moyReel - moyPred;

    const ecartPred = (e.predH - e.predA) / 2;
    const ecartReel = (e.reelH - e.reelA) / 2;
    numerateur += ecartPred * ecartReel;
    denominateur += ecartPred * ecartPred;
  }

  const d = sommeNiveau / echantillon.length;
  const brut = denominateur > 0 ? numerateur / denominateur : 1;
  const k = Math.min(4, Math.max(0.5, brut));

  return { d, k, n: echantillon.length, kBrut: brut };
}

/** Le score corrige : moyenne + k x ecart + d, arrondi, sans nul. */
function corriger(predH, predA, { d, k }) {
  const moy = (predH + predA) / 2;
  const ecart = (predH - predA) / 2;
  let h = Math.max(0, Math.round(moy + k * ecart + d));
  let a = Math.max(0, Math.round(moy - k * ecart + d));
  if (h === a) {
    // Pas de nul, comme chez Bob : on departage dans le sens de l'ecart predit,
    // pour ne surtout pas changer le vainqueur designe.
    if (ecart >= 0) h += 1; else a += 1;
  }
  return [h, a];
}

const moy = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const ecartType = (xs) => {
  if (xs.length < 2) return 0;
  const m = moy(xs);
  return Math.sqrt(moy(xs.map((x) => (x - m) ** 2)));
};

async function main() {
  require('dotenv').config();

  const url = process.env.DATABASE_URL || '';
  let hote = 'inconnue';
  try { hote = new URL(url).hostname; } catch { /* laissee a inconnue */ }
  console.log(`Base interrogee : ${hote}\n`);

  const matchs = await prisma.match.findMany({
    where: { status: 'FINISHED', homeScore: { not: null }, awayScore: { not: null } },
    orderBy: [{ round: 'asc' }, { kickoff: 'asc' }],
  });

  if (!matchs.length) {
    console.log('Aucune rencontre terminee en base.');
    return;
  }

  const journees = [...new Set(matchs.map((m) => m.round))].sort((a, b) => a - b);

  const tous = [];        // toutes les predictions mesurees, pour les statistiques
  const lignes = [];      // une ligne par journee

  for (const journee of journees) {
    const avant = matchs.filter((m) => m.round < journee);
    if (!avant.length) continue;

    const stats = moyennes(avant);
    const duJour = matchs.filter((m) => m.round === journee);

    /*
     * L'echantillon d'ajustement : les pronostics que Bob AURAIT faits sur les
     * journees passees, confrontes a ce qui s'est reellement produit. On le
     * reconstruit ici plutot que de le cumuler au fil de la boucle, parce que
     * chaque journee passee doit elle-meme etre pronostiquee avec les seules
     * donnees qui la precedaient — sinon on ajusterait sur un Bob qui en savait
     * plus que le vrai.
     */
    const echantillon = [];
    for (const j of journees.filter((x) => x < journee)) {
      const avantJ = matchs.filter((m) => m.round < j);
      if (!avantJ.length) continue;
      const statsJ = moyennes(avantJ);
      for (const m of matchs.filter((x) => x.round === j)) {
        const [ph, pa] = pronoBob(statsJ[m.homeTeamId] || null, statsJ[m.awayTeamId] || null);
        echantillon.push({ predH: ph, predA: pa, reelH: m.homeScore, reelA: m.awayScore });
      }
    }

    const reglage = ajuster(echantillon);

    const l = {
      journee, n: duJour.length, reglage,
      bob: 0, calibre: 0,
      bonsBob: 0, bonsCalibre: 0,
      bandeBob: 0, bandeCalibre: 0,
    };

    for (const m of duJour) {
      const [ph, pa] = pronoBob(stats[m.homeTeamId] || null, stats[m.awayTeamId] || null);
      const [ch, ca] = corriger(ph, pa, reglage);

      const pB = points(ph, pa, m.homeScore, m.awayScore);
      const pC = points(ch, ca, m.homeScore, m.awayScore);

      l.bob += pB;
      l.calibre += pC;
      if (pB >= 2) l.bandeBob++;
      if (pC >= 2) l.bandeCalibre++;
      if (vainqueur(ph, pa) === vainqueur(m.homeScore, m.awayScore)) l.bonsBob++;
      if (vainqueur(ch, ca) === vainqueur(m.homeScore, m.awayScore)) l.bonsCalibre++;

      tous.push({
        predH: ph, predA: pa, corrH: ch, corrA: ca,
        reelH: m.homeScore, reelA: m.awayScore,
      });
    }

    lignes.push(l);
  }

  if (!lignes.length) {
    console.log('Une seule journee jouee : il n\'y a encore rien a mesurer.');
    return;
  }

  const n = tous.length;

  /* ---------------------------------------------------------------------- */
  /* 1. Le diagnostic : biais et amplitude de Bob tel qu'il est             */
  /* ---------------------------------------------------------------------- */

  const biaisDom = moy(tous.map((t) => t.predH - t.reelH));
  const biaisExt = moy(tous.map((t) => t.predA - t.reelA));
  const biaisNiveau = moy(tous.map((t) => (t.predH + t.predA) / 2 - (t.reelH + t.reelA) / 2));

  const ecartsPred = tous.map((t) => t.predH - t.predA);
  const ecartsReel = tous.map((t) => t.reelH - t.reelA);

  const dansLaBandePred = (t) =>
    Math.abs(t.predH - t.reelH) <= ECART_PROCHE && Math.abs(t.predA - t.reelA) <= ECART_PROCHE;
  const dansLaBandeCorr = (t) =>
    Math.abs(t.corrH - t.reelH) <= ECART_PROCHE && Math.abs(t.corrA - t.reelA) <= ECART_PROCHE;

  console.log(`Diagnostic sur ${n} pronostics (journees ${lignes[0].journee} a ${lignes[lignes.length - 1].journee}).\n`);
  console.log(`Niveau   : Bob annonce en moyenne ${biaisNiveau >= 0 ? '+' : ''}${biaisNiveau.toFixed(1)} point(s) par equipe`);
  console.log(`           par rapport au reel (domicile ${biaisDom >= 0 ? '+' : ''}${biaisDom.toFixed(1)}, exterieur ${biaisExt >= 0 ? '+' : ''}${biaisExt.toFixed(1)}).`);
  console.log(`           Un chiffre proche de zero veut dire qu'il vise juste en moyenne.\n`);
  console.log(`Amplitude: ecart annonce, ecart-type ${ecartType(ecartsPred).toFixed(1)} points`);
  console.log(`           ecart reel,    ecart-type ${ecartType(ecartsReel).toFixed(1)} points`);
  const rapport = ecartType(ecartsPred) > 0 ? ecartType(ecartsReel) / ecartType(ecartsPred) : 0;
  console.log(`           Les vrais matchs sont donc ${rapport.toFixed(1)} fois plus tranches que ceux de Bob.`);
  console.log(`           Au-dessus de 1, il annonce des rencontres trop serrees.`);
  /*
   * Ce rapport et le facteur k ne disent pas la meme chose, et les confondre
   * serait l'erreur a ne pas commettre.
   *
   * Le rapport des ecarts-types compare deux dispersions sans regarder si elles
   * vont ensemble : il dit de combien les vrais matchs sont plus tranches que
   * ceux de Bob. Le facteur k, lui, est ajuste par moindres carres, donc il ne
   * retient que la part de l'ecart annonce qui predit effectivement l'ecart
   * reel.
   *
   * Si k est nettement inferieur au rapport, la conclusion est severe : l'ecart
   * annonce par Bob est en bonne partie du bruit, et l'amplifier amplifierait le
   * bruit. C'est exactement le cas qu'il faut savoir reconnaitre avant de
   * toucher a sa formule.
   */
  const kGlobal = ajuster(tous.map((t) => ({ predH: t.predH, predA: t.predA, reelH: t.reelH, reelA: t.reelA })));
  console.log(`           Part de cet ecart qui predit vraiment le reel : k = ${kGlobal.kBrut.toFixed(2)}.`);
  console.log(
    kGlobal.kBrut < rapport * 0.6
      ? '           Nettement sous le rapport ci-dessus : une bonne part de l\'ecart\n' +
        '           annonce par Bob est du bruit, et l\'amplifier amplifierait le bruit.\n'
      : '           Proche du rapport ci-dessus : son ecart porte une vraie information,\n' +
        '           elle est seulement sous-dimensionnee.\n'
  );
  console.log(`Erreur moyenne par equipe : ${moy(tous.map((t) => (Math.abs(t.predH - t.reelH) + Math.abs(t.predA - t.reelA)) / 2)).toFixed(1)} points.`);
  console.log(`Bande des 2 points atteinte : ${tous.filter(dansLaBandePred).length} fois sur ${n}.\n`);

  /* ---------------------------------------------------------------------- */
  /* 2. Ce que le calibrage change, journee par journee                     */
  /* ---------------------------------------------------------------------- */

  const col = (x) => String(x).padStart(11);
  console.log('Bob tel quel, et Bob calibre. Les constantes sont ajustees sur les seules journees anterieures.\n');
  console.log(
    'Journee'.padEnd(9) + 'matchs'.padStart(7) +
    col('d') + col('k') + col('Bob') + col('calibre') + col('bons Bob') + col('bons cal.')
  );
  console.log('-'.repeat(9 + 7 + 11 * 6));

  for (const l of lignes) {
    console.log(
      `J${l.journee}`.padEnd(9) + String(l.n).padStart(7) +
      col(l.reglage.d.toFixed(1)) + col(l.reglage.k.toFixed(2)) +
      col(l.bob) + col(l.calibre) + col(l.bonsBob) + col(l.bonsCalibre)
    );
  }

  const somme = (f) => lignes.reduce((s, l) => s + f(l), 0);
  console.log('-'.repeat(9 + 7 + 11 * 6));
  console.log(
    'Total'.padEnd(9) + String(n).padStart(7) + col('') + col('') +
    col(somme((l) => l.bob)) + col(somme((l) => l.calibre)) +
    col(somme((l) => l.bonsBob)) + col(somme((l) => l.bonsCalibre))
  );

  /* ---------------------------------------------------------------------- */
  /* 3. Le verdict                                                          */
  /* ---------------------------------------------------------------------- */

  const gain = somme((l) => l.calibre) - somme((l) => l.bob);
  const bandeAvant = tous.filter(dansLaBandePred).length;
  const bandeApres = tous.filter(dansLaBandeCorr).length;
  const vainqueursIdentiques = somme((l) => l.bonsBob) === somme((l) => l.bonsCalibre);

  console.log(`\nBande des 2 points : ${bandeAvant} fois avant calibrage, ${bandeApres} fois apres.`);
  console.log(
    vainqueursIdentiques
      ? 'Vainqueurs designes : identiques, comme annonce — le calibrage ne touche pas au signe.'
      : 'ATTENTION : le calibrage a change des vainqueurs, ce qui ne devrait pas arriver.\n' +
        'Un arrondi a du basculer une egalite ; a regarder avant d\'appliquer quoi que ce soit.'
  );
  console.log(`Points : ${gain >= 0 ? '+' : ''}${gain} sur ${n} matchs, soit ${(gain / n).toFixed(2)} par match.`);

  /*
   * Le seuil de decision, pose avant de voir le resultat.
   *
   * Sur une trentaine de matchs, un gain de deux ou trois points ne prouve rien
   * — c'est l'ordre de grandeur du bruit, le backtest l'a deja montre en
   * separant quatre strategies par deux points. On ne touche a `bob.service.js`
   * que si le gain depasse franchement cela, et si le reglage va dans un sens
   * stable d'une journee a l'autre.
   */
  console.log(
    '\nLecture : un gain de 2 ou 3 points sur cet echantillon ne prouve rien, c\'est\n' +
    'l\'ordre de grandeur du bruit. Ce qui compte autant que le total, c\'est la\n' +
    'stabilite des colonnes d et k : si k reste du meme cote de 1 d\'une journee a\n' +
    'l\'autre, le defaut est reel et se corrige. S\'il saute de 0,5 a 4, il n\'y a\n' +
    'rien a corriger et le dossier se ferme.'
  );
}

main()
  .catch((err) => { console.error('\nEchec :', err.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
