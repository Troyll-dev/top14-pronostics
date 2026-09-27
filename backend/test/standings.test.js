const test = require('node:test');
const assert = require('node:assert/strict');
const { computeTable, VICTOIRE, NUL } = require('../src/services/standings-compute');

/** Une rencontre au format que rend la source LNR. */
function m(homeSlug, homeScore, awayScore, awaySlug, bonus = {}) {
  return {
    homeSlug, awaySlug, homeScore, awayScore,
    bonus: {
      home: { o: !!bonus.ho, d: !!bonus.hd },
      away: { o: !!bonus.ao, d: !!bonus.ad },
    },
  };
}

const par = (t) => Object.fromEntries(t.map((l) => [l.slug, l]));

test('bareme : victoire 4, nul 2, defaite 0', () => {
  const t = par(computeTable([m('a', 30, 10, 'b'), m('c', 15, 15, 'd')]));
  assert.equal(t.a.points, VICTOIRE);
  assert.equal(t.b.points, 0);
  assert.equal(t.c.points, NUL);
  assert.equal(t.d.points, NUL);
  assert.equal(VICTOIRE, 4);
  assert.equal(NUL, 2);
});

test('les bonus sont lus, pas recalcules', () => {
  // b perd de 3 points : le bonus defensif est merite, mais c'est la page qui
  // le dit. Si on le deduisait de l'ecart, un changement de reglement de la
  // LNR nous rendrait faux sans prevenir.
  const t = par(computeTable([m('a', 20, 17, 'b', { ho: true, ad: true })]));
  assert.equal(t.a.points, VICTOIRE + 1);
  assert.equal(t.a.bonusOff, 1);
  assert.equal(t.b.points, 1);
  assert.equal(t.b.bonusDef, 1);

  // et l'inverse : un ecart de 3 sans badge ne donne aucun bonus
  const u = par(computeTable([m('a', 20, 17, 'b')]));
  assert.equal(u.b.points, 0);
  assert.equal(u.b.bonusDef, 0);
});

test('les bonus vont au bon cote', () => {
  const t = par(computeTable([m('a', 40, 10, 'b', { ho: true })]));
  assert.equal(t.a.bonusOff, 1);
  assert.equal(t.b.bonusOff, 0);
});

test('joues, gagnes, perdus, points pour et contre', () => {
  const t = par(computeTable([
    m('a', 30, 10, 'b'),
    m('c', 20, 25, 'a'),
    m('a', 15, 15, 'd'),
  ]));
  // a gagne deux fois : chez lui contre b, et a l'exterieur chez c.
  assert.equal(t.a.played, 3);
  assert.equal(t.a.won, 2);
  assert.equal(t.a.lost, 0);
  assert.equal(t.a.drawn, 1);
  assert.equal(t.a.points, 2 * VICTOIRE + NUL);
  assert.equal(t.a.pointsFor, 30 + 25 + 15);
  assert.equal(t.a.pointsAgainst, 10 + 20 + 15);
  assert.equal(t.a.diff, t.a.pointsFor - t.a.pointsAgainst);
});

test('une rencontre non jouee est ignoree', () => {
  const t = computeTable([m('a', 30, 10, 'b'), m('c', null, null, 'd')]);
  assert.equal(t.length, 2, 'c et d ne doivent pas apparaitre');
  assert.deepEqual(t.map((l) => l.slug).sort(), ['a', 'b']);
});

test('les essais sont explicitement nuls, pas absents', () => {
  const [l] = computeTable([m('a', 30, 10, 'b')]);
  assert.equal(l.triesFor, null);
  assert.equal(l.triesAgainst, null);
  assert.ok('triesFor' in l, 'le champ doit exister pour que l\'affichage montre un tiret');
});

/**
 * Le departage. C'est la partie du calcul qu'on ne verifie jamais a l'oeil,
 * parce qu'elle ne se voit que le jour ou deux clubs sont a egalite — et ce
 * jour-la, personne ne pense a verifier le code.
 */
test('a egalite de points, la confrontation directe passe avant la difference', () => {
  /**
   * La mise en scene doit etre exacte, sinon le test ne teste rien : il faut
   * que les deux clubs soient a egalite de points ET que celui qui a gagne la
   * confrontation ait la moins bonne difference. Sans quoi on ne saurait pas
   * lequel des deux criteres a trie.
   *
   *   a bat b 6-3           -> a : 4 pts, diff +3
   *   b ecrase x 40-0       -> b : 4 pts, diff -3 +40 = +37
   *
   * b a donc une bien meilleure difference, mais a l'a battu. Le reglement
   * donne la priorite a la confrontation directe : a doit passer devant.
   */
  const matchs = [m('a', 6, 3, 'b'), m('b', 40, 0, 'x')];
  const t = computeTable(matchs);
  const p = par(t);

  assert.equal(p.a.points, p.b.points, 'la mise en scene exige une egalite de points');
  assert.ok(p.b.diff > p.a.diff, 'la mise en scene exige que b ait la meilleure difference');

  assert.equal(t[0].slug, 'a', 'a a gagne la confrontation directe, il passe devant');
});

test('sans confrontation directe, la difference departage', () => {
  // a et b a 4 points chacun, jamais rencontres : c'est la diff qui tranche.
  const t = computeTable([m('a', 30, 0, 'x'), m('b', 10, 0, 'y')]);
  const p = par(t);
  assert.equal(p.a.points, p.b.points);
  assert.equal(t[0].slug, 'a', 'meilleure difference');
});

test('a egalite de points et de confrontation, la difference departage', () => {
  const t = computeTable([
    m('a', 20, 10, 'x'),   // a : 4 pts, +10
    m('b', 30, 10, 'y'),   // b : 4 pts, +20
  ]);
  assert.equal(t[0].slug, 'b');
});

test('a egalite de points et de difference, les points marques departagent', () => {
  const t = computeTable([
    m('a', 20, 10, 'x'),   // 4 pts, +10, 20 marques
    m('b', 40, 30, 'y'),   // 4 pts, +10, 40 marques
  ]);
  assert.equal(t[0].slug, 'b');
});

test('le rang est continu et commence a 1', () => {
  const t = computeTable([
    m('a', 30, 0, 'b'),
    m('c', 20, 10, 'd'),
    m('e', 15, 15, 'f'),
  ]);
  assert.deepEqual(t.map((l) => l.rank), [1, 2, 3, 4, 5, 6]);
});

/**
 * Propriete de conservation : chaque rencontre distribue exactement 4 points
 * de victoire (ou 2 + 2 sur un nul), plus un point par bonus. Le total du
 * tableau doit tomber juste. C'est le test qui attrape un double comptage —
 * le genre d'erreur qui ne se voit sur aucune ligne prise separement.
 */
test('conservation : le total des points correspond aux rencontres', () => {
  const matchs = [
    m('a', 30, 10, 'b', { ho: true }),
    m('c', 15, 15, 'd'),
    m('e', 20, 17, 'f', { ad: true }),
    m('a', 9, 12, 'c'),
  ];
  const attendu = matchs.length * VICTOIRE + 2; // 4 rencontres + 2 bonus
  const total = computeTable(matchs).reduce((s, l) => s + l.points, 0);
  assert.equal(total, attendu);
});

test('conservation : joues, et pour = contre sur l\'ensemble', () => {
  const matchs = [
    m('a', 30, 10, 'b'),
    m('c', 15, 15, 'd'),
    m('e', 20, 17, 'f'),
  ];
  const t = computeTable(matchs);
  assert.equal(t.reduce((s, l) => s + l.played, 0), matchs.length * 2);
  assert.equal(
    t.reduce((s, l) => s + l.pointsFor, 0),
    t.reduce((s, l) => s + l.pointsAgainst, 0),
    'les points marques par les uns sont les points encaisses par les autres'
  );
  assert.equal(t.reduce((s, l) => s + l.diff, 0), 0);
});

test('un tableau vide ne casse pas', () => {
  assert.deepEqual(computeTable([]), []);
});
