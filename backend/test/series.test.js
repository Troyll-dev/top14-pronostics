const test = require('node:test');
const assert = require('node:assert');

const { vainqueursParJournee, serieDe, phrases } = require('../src/services/series.service');

/** Raccourci : un pronostic note, decrit par joueur, journee et points. */
const P = (userId, round, points) => ({ userId, round, points });

/* --- les vainqueurs de journee ------------------------------------------- */

test('le vainqueur d une journee est celui qui totalise le plus de points', () => {
  const j = vainqueursParJournee([
    P(1, 3, 2), P(1, 3, 1),   // 3 points
    P(2, 3, 1), P(2, 3, 1),   // 2 points
  ]);
  assert.deepStrictEqual(j, [{ round: 3, meilleur: 3, gagnants: [1] }]);
});

test('une egalite en tete fait deux vainqueurs, on ne tranche pas en silence', () => {
  const j = vainqueursParJournee([P(1, 3, 3), P(2, 3, 3), P(3, 3, 1)]);
  assert.deepStrictEqual(j[0].gagnants, [1, 2]);
});

test('une journee ou personne n a marque n a aucun vainqueur', () => {
  const j = vainqueursParJournee([P(1, 3, 0), P(2, 3, 0)]);
  assert.deepStrictEqual(j[0].gagnants, []);
});

test('les journees ressortent dans l ordre, quel que soit celui des pronostics', () => {
  const j = vainqueursParJournee([P(1, 5, 3), P(1, 3, 2), P(1, 4, 1)]);
  assert.deepStrictEqual(j.map((x) => x.round), [3, 4, 5]);
});

test('le total compte les points multiplies, joker compris', () => {
  // Celui qui a bien place son joker a gagne sa journee pour de bon : on somme
  // `points`, pas le bareme.
  const j = vainqueursParJournee([P(1, 3, 6), P(2, 3, 3), P(2, 3, 2)]);
  assert.deepStrictEqual(j[0].gagnants, [1]);
});

/* --- la serie en cours ---------------------------------------------------- */

const JOURNEES = [
  { round: 3, meilleur: 5, gagnants: [2] },
  { round: 4, meilleur: 4, gagnants: [1] },
  { round: 5, meilleur: 6, gagnants: [1] },
];

test('deux journees gagnees d affilee', () => {
  assert.deepStrictEqual(serieDe(JOURNEES, 1), { longueur: 2, derniereJournee: 5 });
});

test('une serie interrompue ne compte plus, meme recente', () => {
  // Le joueur 2 a gagne la J3 et plus rien depuis. Lui rappeler cette serie-la
  // n'interesserait personne, et surtout pas lui.
  assert.deepStrictEqual(serieDe(JOURNEES, 2), { longueur: 0, derniereJournee: null });
});

test('un joueur qui n a jamais gagne n a pas de serie', () => {
  assert.deepStrictEqual(serieDe(JOURNEES, 9), { longueur: 0, derniereJournee: null });
});

test('une journee sans vainqueur casse les series', () => {
  const avecTrou = [
    { round: 3, gagnants: [1] },
    { round: 4, gagnants: [] },
  ];
  assert.strictEqual(serieDe(avecTrou, 1).longueur, 0);
});

test('une egalite compte comme une victoire pour les deux', () => {
  const partage = [{ round: 4, gagnants: [1, 2] }];
  assert.strictEqual(serieDe(partage, 1).longueur, 1);
  assert.strictEqual(serieDe(partage, 2).longueur, 1);
});

/* --- les phrases ---------------------------------------------------------- */

test('sans serie, on ne dit rien', () => {
  assert.deepStrictEqual(phrases({ serie: { longueur: 0, derniereJournee: null } }), []);
  assert.deepStrictEqual(phrases({}), []);
});

test('une seule journee gagnee nomme la journee', () => {
  const l = { serie: { longueur: 1, derniereJournee: 4 } };
  assert.match(phrases(l, { pourSoi: true })[0], /journée 4/);
  assert.match(phrases(l, { pourSoi: false })[0], /Vainqueur de la journée 4/);
});

test('a partir de deux, on parle de serie', () => {
  const l = { serie: { longueur: 3, derniereJournee: 5 } };
  assert.match(phrases(l, { pourSoi: true })[0], /3 journées gagnées d'affilée/);
  assert.match(phrases(l, { pourSoi: false })[0], /3 journées gagnées d'affilée/);
});

test('le tutoiement ne sert que pour le destinataire', () => {
  const l = { serie: { longueur: 1, derniereJournee: 4 } };
  assert.match(phrases(l, { pourSoi: true })[0], /^Tu as gagné/);
  assert.doesNotMatch(phrases(l, { pourSoi: false })[0], /^Tu /);
});
