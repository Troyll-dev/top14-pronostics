const test = require('node:test');
const assert = require('node:assert');

const { serieDe, avecEcarts, phrases, SERIE_MINI } = require('../src/services/series.service');

/** Raccourci : une liste de pronostics decrits par leur seul bareme. */
const P = (...baremes) => baremes.map((basePoints) => ({ basePoints }));

/* --- les series ---------------------------------------------------------- */

test('aucun pronostic : pas de serie, et surtout pas une serie de defaites', () => {
  assert.deepStrictEqual(serieDe([]), { type: null, longueur: 0, record: 0 });
});

test('quatre bons de suite', () => {
  assert.deepStrictEqual(serieDe(P(1, 2, 3, 1)), { type: 'bon', longueur: 4, record: 4 });
});

test('une serie cassee repart a un, le record reste', () => {
  assert.deepStrictEqual(serieDe(P(1, 2, 3, 0)), { type: 'rate', longueur: 1, record: 3 });
});

test('le record garde la meilleure serie, pas la derniere', () => {
  assert.deepStrictEqual(serieDe(P(1, 1, 1, 1, 0, 1)), { type: 'bon', longueur: 1, record: 4 });
});

test('les defaites se comptent aussi', () => {
  assert.deepStrictEqual(serieDe(P(2, 0, 0, 0)), { type: 'rate', longueur: 3, record: 1 });
});

test('un pronostic non note est ignore et ne casse pas la serie', () => {
  // Match reporte, ou points pas encore calcules : il n'apprend rien. Le
  // compter comme un echec punirait quelqu'un pour un match qui ne s'est pas
  // joue.
  const avecTrou = [{ basePoints: 1 }, { basePoints: null }, { basePoints: 2 }];
  assert.deepStrictEqual(serieDe(avecTrou), { type: 'bon', longueur: 2, record: 2 });
});

test('les pronostics d avant les multiplicateurs se lisent sur points', () => {
  // `basePoints` est nul sur ces lignes-la ; a l'epoque les deux valeurs
  // etaient egales.
  const anciens = [{ points: 3 }, { points: 1 }];
  assert.deepStrictEqual(serieDe(anciens), { type: 'bon', longueur: 2, record: 2 });
});

test('le joker ne compte pas double : c est le bareme qui fait foi', () => {
  // Un bon vainqueur joue en joker vaut 2 points au total et reste UN bon
  // pronostic. Si la serie se lisait sur `points`, elle compterait pareil —
  // mais un score exact en joker vaudrait 6 et casserait toute comparaison.
  const avecJoker = [{ basePoints: 1, points: 2 }, { basePoints: 3, points: 6 }];
  assert.deepStrictEqual(serieDe(avecJoker), { type: 'bon', longueur: 2, record: 2 });
});

/* --- les ecarts ---------------------------------------------------------- */

const CLASSEMENT = [
  { id: 1, username: 'Chien', rank: 1, totalPoints: 11 },
  { id: 2, username: 'Nico', rank: 2, totalPoints: 10 },
  { id: 3, username: 'Scalpa', rank: 3, totalPoints: 6 },
  { id: 9, username: 'Bibi', rank: null, totalPoints: 20, enPause: true },
];

test('le premier n a personne devant lui', () => {
  const [chef] = avecEcarts(CLASSEMENT);
  assert.strictEqual(chef.devant, null);
  assert.deepStrictEqual(chef.derriere, { username: 'Nico', ecart: 1 });
});

test('le dernier classe n a personne derriere lui', () => {
  const dernier = avecEcarts(CLASSEMENT).find((l) => l.username === 'Scalpa');
  assert.deepStrictEqual(dernier.devant, { username: 'Nico', ecart: 4 });
  assert.strictEqual(dernier.derriere, null);
});

test('un joueur en pause n a ni voisin ni ecart, malgre ses points', () => {
  // Bibi a le plus de points du lot. Il ne joue plus : il ne doit apparaitre
  // dans l'ecart de personne, sans quoi on annoncerait « 9 points derriere
  // Bibi » a propos de quelqu'un qui a quitte la competition.
  const enPause = avecEcarts(CLASSEMENT).find((l) => l.username === 'Bibi');
  assert.strictEqual(enPause.devant, null);
  assert.strictEqual(enPause.derriere, null);

  const chef = avecEcarts(CLASSEMENT)[0];
  assert.strictEqual(chef.devant, null);
});

test('une egalite de points donne un ecart de zero, pas l absence de voisin', () => {
  const egaux = [
    { id: 1, username: 'A', rank: 1, totalPoints: 10 },
    { id: 2, username: 'B', rank: 2, totalPoints: 10 },
  ];
  const b = avecEcarts(egaux)[1];
  assert.deepStrictEqual(b.devant, { username: 'A', ecart: 0 });
});

/* --- les phrases --------------------------------------------------------- */

test('une serie trop courte ne se dit pas', () => {
  const ligne = { serie: { type: 'bon', longueur: SERIE_MINI - 1 }, devant: null, derriere: null };
  assert.deepStrictEqual(phrases(ligne), []);
});

test('une serie assez longue se dit, et le tutoiement depend du destinataire', () => {
  const ligne = { serie: { type: 'bon', longueur: 4 }, devant: null, derriere: null };
  assert.match(phrases(ligne, { pourSoi: true })[0], /ne change rien/);
  assert.doesNotMatch(phrases(ligne, { pourSoi: false })[0], /ne change rien/);
});

test('sans rien a dire, on ne dit rien', () => {
  // Pas de serie, pas de voisin : la rubrique disparait plutot que d'afficher
  // une banalite. Une rubrique remplie de force n'est plus lue au bout de deux
  // semaines.
  assert.deepStrictEqual(phrases({ serie: null, devant: null, derriere: null }), []);
});

test('le premier du classement s entend dire son avance, pas son retard', () => {
  const chef = { serie: null, devant: null, derriere: { username: 'Nico', ecart: 1 } };
  assert.match(phrases(chef)[0], /avance/);
});

test('le singulier et le pluriel suivent le nombre de points', () => {
  const un = { serie: null, devant: { username: 'Chien', ecart: 1 }, derriere: null };
  const deux = { serie: null, devant: { username: 'Chien', ecart: 2 }, derriere: null };
  assert.match(phrases(un)[0], /1 point te sépare/);
  assert.match(phrases(deux)[0], /2 points te séparent/);
});
