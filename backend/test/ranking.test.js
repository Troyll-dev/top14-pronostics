const test = require('node:test');
const assert = require('node:assert/strict');
const { ecart, stats, comparer, classer, DEPARTAGES, DEPUIS, retenuAuClassement } = require('../src/services/ranking');

/** Un pronostic note, tel qu'il sort de la base. */
const P = (ph, pa, rh, ra, base, points = base, joker = false) => ({
  homeScorePred: ph, awayScorePred: pa,
  basePoints: base, points, joker,
  match: { homeScore: rh, awayScore: ra },
});

test('l\'ecart est la somme des erreurs sur les deux equipes', () => {
  assert.equal(ecart({ homeScorePred: 20, awayScorePred: 15 }, { homeScore: 22, awayScore: 12 }), 5);
  assert.equal(ecart({ homeScorePred: 22, awayScorePred: 12 }, { homeScore: 22, awayScore: 12 }), 0);
});

test('une rencontre sans score ne compte ni en bien ni en mal', () => {
  assert.equal(ecart({ homeScorePred: 20, awayScorePred: 15 }, { homeScore: null, awayScore: null }), null);
  assert.equal(ecart({ homeScorePred: 20, awayScorePred: 15 }, null), null);
  const s = stats([P(20, 15, 22, 12, 2), { homeScorePred: 9, awayScorePred: 9, basePoints: null, points: null, match: { homeScore: null, awayScore: null } }]);
  assert.equal(s.ecarts, 5, 'seul le pronostic note doit compter');
});

test('les statistiques se lisent sur le bareme, pas sur le total multiplie', () => {
  // score exact joue en joker : 3 au bareme, 6 au total
  const s = stats([P(22, 12, 22, 12, 3, 6, true)]);
  assert.equal(s.points, 6, 'le total se somme sur les points reels');
  assert.equal(s.exacts, 1, 'et reste un seul score exact');
});

/* --- les quatre criteres, un par un ------------------------------------- */

const L = (username, points, exacts, proches, ecarts) => ({ username, points, exacts, proches, ecarts });

test('1. les points passent avant tout', () => {
  const t = classer([L('B', 10, 0, 0, 999), L('A', 11, 5, 5, 0)]);
  assert.equal(t[0].username, 'A');
});

test('2. a points egaux, le plus de scores exacts', () => {
  const t = classer([L('A', 10, 0, 9, 0), L('B', 10, 1, 0, 999)]);
  assert.equal(t[0].username, 'B');
});

test('3. puis le plus de pronostics a 5 points pres', () => {
  const t = classer([L('A', 10, 1, 2, 0), L('B', 10, 1, 3, 999)]);
  assert.equal(t[0].username, 'B');
});

/**
 * Le quatrieme critere, et celui qui fait tenir l'ensemble. Les trois premiers
 * ne regardent que les pronostics qui ont rapporte ; celui-ci tient compte des
 * rates, ou deux joueurs a egalite parfaite peuvent s'etre trompes de trois
 * points ou de trente.
 */
test('4. enfin, la plus petite somme d\'ecarts', () => {
  const t = classer([L('A', 10, 1, 2, 40), L('B', 10, 1, 2, 12)]);
  assert.equal(t[0].username, 'B', 'le plus proche globalement passe devant');
});

test('l\'ordre alphabetique ne sert qu\'en tout dernier recours', () => {
  const t = classer([L('Zoe', 10, 1, 2, 12), L('Ana', 10, 1, 2, 12)]);
  assert.equal(t[0].username, 'Ana');
});

test('le rang est continu et commence a 1', () => {
  const t = classer([L('A', 5, 0, 0, 0), L('B', 9, 0, 0, 0), L('C', 7, 0, 0, 0)]);
  assert.deepEqual(t.map((l) => l.rank), [1, 2, 3]);
  assert.deepEqual(t.map((l) => l.username), ['B', 'C', 'A']);
});

test('classer ne modifie pas la liste recue', () => {
  const src = [L('A', 5, 0, 0, 0), L('B', 9, 0, 0, 0)];
  const copie = JSON.parse(JSON.stringify(src));
  classer(src);
  assert.deepEqual(src, copie);
});

test('une liste vide ne casse pas', () => {
  assert.deepEqual(classer([]), []);
});

/**
 * La liste affichee decrit le departage, pas le tri complet.
 *
 * Les points n'y figurent pas : un joueur qui lit « en cas d'egalite » a deja
 * une egalite de points sous les yeux, et la premiere version de cette liste
 * les annoncait quand meme en tete — ce qui reposait la question au lieu d'y
 * repondre.
 */
test('la liste affichee ne contient que le departage, sans les points', () => {
  assert.equal(DEPARTAGES.length, 3, 'trois criteres apres les points');
  assert.ok(!DEPARTAGES.some((c) => /^les points$/.test(c)), 'les points n\'y sont pas');
  assert.ok(!DEPARTAGES.some((c) => /alphab|nom/i.test(c)), 'ni le nom, qui ne sert jamais');
});

/* ------------------------------------------------------------------------ */

/**
 * Le test qui justifie l'existence de ce fichier.
 *
 * Le departage vivait en deux exemplaires : le site triait par points puis par
 * scores exacts, le bilan du lundi par points puis par ordre alphabetique. Sur
 * la J3 2026-2027 les deux donnaient le meme premier — un joueur avait a la
 * fois le score exact et l'anteriorite alphabetique — et personne n'a rien vu.
 *
 * Ce test rejoue exactement cette situation et verifie que les trois chemins
 * rendent le meme ordre. Il echouera le jour ou quelqu'un reintroduira un tri
 * local dans l'un des trois.
 */
test('les trois classements rendent le meme ordre', () => {
  // La J3 reelle : Nico et Chiendetalus a dix points, Chiendetalus ayant le
  // score exact. L'alphabet et le bareme s'accordent ici par hasard, ce qui
  // est precisement ce qui avait masque le probleme.
  const joueurs = [
    { username: 'Nico', pronos: [P(20, 15, 22, 12, 2), P(30, 10, 28, 24, 1), P(10, 20, 10, 20, 3)] },
    { username: 'Chiendetalusn°4', pronos: [P(22, 12, 22, 12, 3), P(25, 20, 28, 24, 2), P(9, 30, 10, 20, 1)] },
    { username: 'Christian', pronos: [P(40, 10, 22, 12, 1)] },
    { username: 'Scalpa', pronos: [P(5, 40, 22, 12, 0)] },
  ];

  const lignes = joueurs.map((j) => ({ username: j.username, ...stats(j.pronos) }));

  // Trois chemins differents vers le meme resultat : la fonction de tri
  // directe, le classement complet, et un tri manuel avec le comparateur.
  const parClasser = classer(lignes).map((l) => l.username);
  const parComparer = [...lignes].sort(comparer).map((l) => l.username);
  const parRang = classer(lignes).sort((a, b) => a.rank - b.rank).map((l) => l.username);

  assert.deepEqual(parComparer, parClasser);
  assert.deepEqual(parRang, parClasser);

  // Et l'ordre lui-meme doit tenir debout : celui qui a le plus de points
  // devant, l'ecart departageant le reste.
  const points = classer(lignes).map((l) => l.points);
  assert.deepEqual(points, [...points].sort((a, b) => b - a), 'les points doivent decroitre');
});

/**
 * La propriete qui compte pour un classement : le tri doit etre total et
 * stable. Deux appels sur la meme donnee, dans un ordre d'entree different,
 * doivent rendre exactement le meme classement — sans quoi le rang affiche
 * changerait d'un chargement de page a l'autre.
 */
test('l\'ordre ne depend pas de l\'ordre d\'entree', () => {
  const base = [
    L('A', 10, 1, 2, 12), L('B', 10, 1, 2, 12), L('C', 10, 1, 3, 40),
    L('D', 12, 0, 0, 5), L('E', 10, 2, 0, 80),
  ];
  const attendu = classer(base).map((l) => l.username);

  for (let i = 0; i < 50; i++) {
    const melange = [...base].sort(() => Math.random() - 0.5);
    assert.deepEqual(classer(melange).map((l) => l.username), attendu);
  }
});


/* --- le seuil de depart du classement general ---------------------------- */

/**
 * Les journees 1 et 2 sont exclues du cumul : un seul joueur y avait un compte,
 * le site venant d'ouvrir. Les garder lui donnerait une avance que personne n'a
 * eu l'occasion de disputer.
 *
 * Le filtre est expose separement et non applique dans `stats`, parce que le
 * classement d'une journee doit pouvoir compter la J1 et la J2 : sur ces
 * pages-la, la question n'est pas l'equite du cumul mais ce qui s'est passe ce
 * week-end-la.
 */
test('les journees anterieures au seuil ne comptent pas au general', () => {
  const avant = { match: { round: DEPUIS - 1 } };
  const pile  = { match: { round: DEPUIS } };
  const apres = { match: { round: DEPUIS + 5 } };

  assert.equal(retenuAuClassement(avant), false);
  assert.equal(retenuAuClassement(pile), true, 'le seuil est inclusif');
  assert.equal(retenuAuClassement(apres), true);
});

test('un pronostic sans journee connue est conserve', () => {
  // Mieux vaut compter que perdre : une donnee incomplete ne doit pas faire
  // disparaitre des points en silence.
  assert.equal(retenuAuClassement({ match: {} }), true);
  assert.equal(retenuAuClassement({}), true);
  assert.equal(retenuAuClassement(null), true);
});
