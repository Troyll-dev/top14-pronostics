const test = require('node:test');
const assert = require('node:assert/strict');
const { pointsFor, MARGE } = require('../src/services/scoring');

const p = (h, a) => ({ homeScorePred: h, awayScorePred: a });
const r = (h, a) => ({ homeScore: h, awayScore: a });

test('score exact : 3 points', () => {
  assert.equal(pointsFor(p(23, 29), r(23, 29)), 3);
  assert.equal(pointsFor(p(0, 0), r(0, 0)), 3);
});

test('mauvais vainqueur : 0 point', () => {
  assert.equal(pointsFor(p(30, 10), r(10, 30)), 0);
  // meme avec un ecart identique : c'est le vainqueur qui compte d'abord
  assert.equal(pointsFor(p(25, 20), r(20, 25)), 0);
});

test('bon vainqueur, ecart proche : 2 points', () => {
  // ecart predit 5, ecart reel 1 : 4 d'ecart, sous la marge
  assert.equal(pointsFor(p(25, 20), r(15, 14)), 2);
});

test('bon vainqueur, ecart lointain : 1 point', () => {
  // ecart predit 20, ecart reel 1 : 19 d'ecart
  assert.equal(pointsFor(p(30, 10), r(15, 14)), 1);
});

/**
 * La frontiere des cinq points. C'est le seul endroit du bareme ou un
 * caractere de trop — `<` au lieu de `<=` — change le resultat sans que
 * personne ne s'en apercoive avant la fin de saison.
 */
test('la marge est inclusive : exactement 5 d\'ecart vaut encore 2 points', () => {
  // ecart predit 10, ecart reel 5 : exactement MARGE
  assert.equal(pointsFor(p(20, 10), r(20, 15)), 2);
  // ecart predit 11, ecart reel 5 : un de trop
  assert.equal(pointsFor(p(21, 10), r(20, 15)), 1);
  assert.equal(MARGE, 5);
});

/**
 * Le match nul. Math.sign rend 0 des deux cotes, donc predire un nul sur un
 * nul passe le test du vainqueur. C'est voulu, mais ca se verifie : une
 * comparaison ecrite autrement (par exemple `predWinner > 0 === realWinner > 0`)
 * donnerait le meme resultat sur les victoires et se tromperait ici.
 */
test('nul predit sur nul reel : bon vainqueur, pas score exact', () => {
  assert.equal(pointsFor(p(20, 20), r(15, 15)), 2);
  assert.equal(pointsFor(p(15, 15), r(15, 15)), 3);
});

test('nul predit, victoire reelle : 0 point', () => {
  assert.equal(pointsFor(p(20, 20), r(21, 20)), 0);
});

test('victoire predite, nul reel : 0 point', () => {
  assert.equal(pointsFor(p(21, 20), r(20, 20)), 0);
});

/**
 * Appelee sur tous les pronos d'un match, cette fonction ne doit jamais lever :
 * une exception ici interromprait l'attribution des points des autres joueurs.
 */
test('resultat ou prono incomplet : 0 point, sans lever', () => {
  assert.equal(pointsFor(p(20, 15), r(null, null)), 0);
  assert.equal(pointsFor(p(20, 15), r(20, undefined)), 0);
  assert.equal(pointsFor(p(null, 15), r(20, 15)), 0);
});

/**
 * Le bareme est symetrique : echanger domicile et exterieur des deux cotes a
 * la fois ne doit rien changer. Cent cas au hasard valent mieux qu'un exemple
 * choisi, parce qu'ils trouvent ce a quoi on n'a pas pense.
 */
test('symetrie domicile / exterieur', () => {
  for (let i = 0; i < 200; i++) {
    const [a, b, c, d] = Array.from({ length: 4 }, () => Math.floor(Math.random() * 60));
    assert.equal(
      pointsFor(p(a, b), r(c, d)),
      pointsFor(p(b, a), r(d, c)),
      `asymetrie sur ${a}-${b} / ${c}-${d}`
    );
  }
});

test('le bareme ne rend que 0, 1, 2 ou 3', () => {
  for (let i = 0; i < 500; i++) {
    const [a, b, c, d] = Array.from({ length: 4 }, () => Math.floor(Math.random() * 80));
    assert.ok([0, 1, 2, 3].includes(pointsFor(p(a, b), r(c, d))));
  }
});
