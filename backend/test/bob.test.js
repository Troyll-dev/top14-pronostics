const test = require('node:test');
const assert = require('node:assert/strict');

const {
  pronostiquerJournee,
  pronostiquerMatch,
  choisirJoker,
  estimer,
  SCORE_DEFAUT,
} = require('../src/services/bob.service');

/**
 * Les tests de Bob.
 *
 * Tout l'intérêt d'avoir sorti le calcul de la base est ici : on peut poser des
 * moyennes à la main et vérifier ce que Bob en fait, sans jouer une journée.
 *
 * Le hasard est remplacé par une suite connue. `des(...)` rend une fonction qui
 * débite les valeurs données puis boucle — chaque valeur est ce que
 * `Math.random` aurait rendu, donc entre 0 et 1. Les deux repères utiles :
 * 0.5 tombe au milieu de l'intervalle, donc un tirage nul ; 0 tombe sur -3 et
 * 0.999 sur +3.
 */
function des(...valeurs) {
  let i = 0;
  return () => valeurs[i++ % valeurs.length];
}

/** Un hasard qui ne bouge pas : aucun écart, pour lire l'estimation brute. */
const neutre = des(0.5);

const forme = (pour, contre) => ({ pointsPourParMatch: pour, pointsContreParMatch: contre });

test('estimer prend la moyenne de l\'attaque et de la défense adverse', () => {
  assert.equal(estimer(30, 20), 25);
});

test('estimer se contente du chiffre connu quand l\'autre manque', () => {
  assert.equal(estimer(30, null), 30);
  assert.equal(estimer(null, 20), 20);
});

test('estimer rend null quand les deux manquent', () => {
  assert.equal(estimer(null, null), null);
  assert.equal(estimer(undefined, undefined), null);
});

test('le recevant reçoit trois points, le visiteur en perd trois', () => {
  // Deux clubs identiques : 25 de moyenne des deux côtés. Sans l'avantage du
  // terrain, le match serait nul ; avec, c'est 28-22.
  const p = pronostiquerMatch({
    dom: forme(25, 25),
    ext: forme(25, 25),
    hasard: neutre,
  });
  assert.deepEqual(p, { homeScorePred: 28, awayScorePred: 22 });
});

test('la meilleure équipe est devant', () => {
  const p = pronostiquerMatch({
    dom: forme(34, 18), // marque beaucoup, encaisse peu
    ext: forme(19, 33), // l'inverse
    hasard: neutre,
  });
  assert.ok(p.homeScorePred > p.awayScorePred);
});

test('une équipe faible qui reçoit une forte reste derrière', () => {
  // L'avantage du terrain ne doit pas renverser un écart réel : six points
  // partagés, ce n'est pas six points donnés au recevant.
  const p = pronostiquerMatch({
    dom: forme(17, 34),
    ext: forme(35, 16),
    hasard: neutre,
  });
  assert.ok(p.awayScorePred > p.homeScorePred);
});

test('sans aucune moyenne, Bob se replie sur un score plausible', () => {
  const p = pronostiquerMatch({ dom: undefined, ext: undefined, hasard: neutre });
  assert.deepEqual(p, {
    homeScorePred: SCORE_DEFAUT + 3,
    awayScorePred: SCORE_DEFAUT - 3,
  });
});

test('le tirage s\'écarte de trois points au plus, dans les deux sens', () => {
  const bas = pronostiquerMatch({ dom: forme(25, 25), ext: forme(25, 25), hasard: des(0) });
  const haut = pronostiquerMatch({ dom: forme(25, 25), ext: forme(25, 25), hasard: des(0.999) });
  assert.deepEqual(bas, { homeScorePred: 25, awayScorePred: 19 });
  assert.deepEqual(haut, { homeScorePred: 31, awayScorePred: 25 });
});

test('les sept valeurs du tirage sortent toutes, et aucune autre', () => {
  const vus = new Set();
  for (let i = 0; i < 7; i++) {
    const p = pronostiquerMatch({
      dom: forme(25, 25),
      ext: forme(25, 25),
      hasard: des(i / 7 + 0.001),
    });
    vus.add(p.homeScorePred - 28);
  }
  assert.deepEqual([...vus].sort((a, b) => a - b), [-3, -2, -1, 0, 1, 2, 3]);
});

test('jamais de match nul', () => {
  // Deux clubs identiques et le même tirage des deux côtés : l'estimation
  // tombe pile sur l'égalité, et c'est le recevant qui est départagé.
  const p = pronostiquerMatch({
    dom: forme(25, 25),
    ext: forme(28, 28), // 26.5 / 26.5 avant avantage… puis 29.5 / 23.5
    hasard: des(0.5, 0.999), // +0 au recevant, +3 au visiteur → 30 / 27
  });
  assert.notEqual(p.homeScorePred, p.awayScorePred);
});

test('nul départagé en faveur de la meilleure estimation', () => {
  // Le visiteur est nettement meilleur ; un hasard défavorable l'amène à
  // égalité avec le recevant. C'est lui qui doit passer devant.
  const p = pronostiquerMatch({
    dom: forme(20, 32),
    ext: forme(33, 19),
    hasard: des(0.999, 0), // +3 au recevant, -3 au visiteur
  });
  assert.ok(p.awayScorePred > p.homeScorePred);
});

test('aucun score ne sort des bornes', () => {
  const p = pronostiquerMatch({ dom: forme(0, 0), ext: forme(0, 0), hasard: des(0) });
  assert.ok(p.homeScorePred >= 0 && p.awayScorePred >= 0);
});

const journee = [
  { id: 101, homeTeamId: 1, awayTeamId: 2, dejaPronostique: false, estAffiche: false },
  { id: 102, homeTeamId: 3, awayTeamId: 4, dejaPronostique: true, estAffiche: false },
  { id: 103, homeTeamId: 5, awayTeamId: 6, dejaPronostique: false, estAffiche: true },
];

test('Bob ne remplit que les cases vides', () => {
  const { pronostics } = pronostiquerJournee({ matchs: journee, hasard: neutre });
  assert.deepEqual(pronostics.map((p) => p.matchId), [101, 103]);
});

test('une journée déjà complète ne produit aucune écriture', () => {
  const { pronostics } = pronostiquerJournee({
    matchs: journee.map((m) => ({ ...m, dejaPronostique: true })),
    hasard: neutre,
  });
  assert.deepEqual(pronostics, []);
});

test('le joker ne se pose jamais sur l\'affiche', () => {
  // Elle est déjà multipliée pour tout le monde : setJoker le refuserait.
  for (let i = 0; i < 20; i++) {
    const { jokerMatchId } = pronostiquerJournee({
      matchs: journee,
      hasard: des(i / 20 + 0.001),
    });
    assert.notEqual(jokerMatchId, 103);
  }
});

test('le joker du joueur n\'est pas déplacé', () => {
  const { jokerMatchId } = pronostiquerJournee({
    matchs: journee,
    jokerDejaPose: true,
    hasard: neutre,
  });
  assert.equal(jokerMatchId, null);
});

test('pas de joker avant sa mise en vigueur', () => {
  const { jokerMatchId } = pronostiquerJournee({
    matchs: journee,
    jokerActif: false,
    hasard: neutre,
  });
  assert.equal(jokerMatchId, null);
});

test('le joker peut tomber sur un match pronostiqué à la main', () => {
  // Le pari existe, c'est tout ce que setJoker demande.
  const vus = new Set();
  for (let i = 0; i < 40; i++) {
    const { jokerMatchId } = pronostiquerJournee({
      matchs: journee,
      hasard: des(0.5, 0.5, 0.5, 0.5, i / 40 + 0.001),
    });
    vus.add(jokerMatchId);
  }
  assert.ok(vus.has(102), 'le match déjà pronostiqué doit être éligible');
  assert.ok(vus.has(101));
});

test('aucun joker quand il n\'y a aucun candidat', () => {
  assert.equal(choisirJoker({ candidats: [], hasard: neutre }), null);
  const { jokerMatchId } = pronostiquerJournee({
    matchs: [journee[2]], // l'affiche seule
    hasard: neutre,
  });
  assert.equal(jokerMatchId, null);
});

test('la forme lue est bien celle de chaque équipe', () => {
  // Le piège le plus coûteux de ce calcul serait d'inverser recevant et
  // visiteur, ou de lire la ligne de la mauvaise équipe : le résultat resterait
  // un score de rugby crédible, et personne ne verrait rien. On vérifie donc
  // que le chiffre écrit se déduit exactement des moyennes données.
  const { pronostics } = pronostiquerJournee({
    matchs: [journee[0]],
    forme: { 1: forme(30, 20), 2: forme(10, 40) },
    hasard: neutre,
  });
  // Recevant : (30 + 40) / 2 = 35, +3 → 38. Visiteur : (10 + 20) / 2 = 15, -3 → 12.
  assert.deepEqual(pronostics[0], { matchId: 101, homeScorePred: 38, awayScorePred: 12 });
});

test('deux appels le même jour ne donnent pas les mêmes scores', () => {
  // La raison d'être du tirage : l'usage de Bob est privé, donc deux colonnes
  // identiques dans « Tous les pronos » le trahiraient.
  const matchs = Array.from({ length: 7 }, (_, i) => ({
    id: 200 + i, homeTeamId: 1, awayTeamId: 2, dejaPronostique: false, estAffiche: false,
  }));
  const f = { 1: forme(25, 25), 2: forme(25, 25) };

  const a = pronostiquerJournee({ matchs, forme: f, hasard: Math.random }).pronostics;
  const b = pronostiquerJournee({ matchs, forme: f, hasard: Math.random }).pronostics;
  assert.notDeepEqual(a, b);
});

/* ===========================================================================
 * L'avis de Bob
 * =========================================================================== */

const { avisJournee, avisMatch, verdict, estimation } = require('../src/services/bob.service');

const duo = [
  { id: 1, homeTeamId: 1, awayTeamId: 2 },
  { id: 2, homeTeamId: 3, awayTeamId: 4 },
];
const formeEquilibree = { 1: forme(25, 25), 2: forme(25, 25), 3: forme(25, 25), 4: forme(25, 25) };

/** Sept matchs entre clubs identiques : Bob y voit 28-22 partout. */
const sept = Array.from({ length: 7 }, (_, i) => ({ id: 10 + i, homeTeamId: 1, awayTeamId: 2 }));
const formeSept = { 1: forme(25, 25), 2: forme(25, 25) };
const grille = (scores) =>
  Object.fromEntries(scores.map(([h, a], i) => [10 + i, { homeScorePred: h, awayScorePred: a }]));

test('l\'estimation ne tire pas aux dés', () => {
  // Deux appels, même résultat : c'est ce qui permet de la comparer au
  // pronostic d'un joueur sans lui reprocher un écart que Bob s'est infligé.
  const a = estimation({ dom: forme(25, 25), ext: forme(25, 25) });
  const b = estimation({ dom: forme(25, 25), ext: forme(25, 25) });
  assert.deepEqual(a, b);
  assert.deepEqual(a, { home: 28, away: 22 });
});

test('un pronostic identique à l\'estimation vaut un accord', () => {
  const a = avisMatch({
    dom: forme(25, 25), ext: forme(25, 25),
    pronostic: { homeScorePred: 28, awayScorePred: 22 },
  });
  assert.equal(a.ecart, 0);
  assert.equal(a.ton, 'accord');
  assert.equal(a.desaccord, false);
});

test('le désaccord de vainqueur passe avant l\'écart', () => {
  // Deux points d'écart seulement, mais l'autre équipe gagne : c'est le
  // désaccord qui compte, pas la distance.
  const a = avisMatch({
    dom: forme(25, 25), ext: forme(25, 25),
    pronostic: { homeScorePred: 24, awayScorePred: 25 },
  });
  assert.equal(a.desaccord, true);
  assert.equal(a.ton, 'desaccord');
});

test('les quatre tons d\'accord se suivent dans le bon ordre', () => {
  const tons = [0, 8, 16, 40].map((d) =>
    avisMatch({
      dom: forme(25, 25), ext: forme(25, 25),
      pronostic: { homeScorePred: 28 + d, awayScorePred: 22 },
    }).ton,
  );
  assert.deepEqual(tons, ['accord', 'proche', 'tiede', 'loin']);
});

test('un pronostic nul a droit à son propre mot', () => {
  const a = avisMatch({
    dom: forme(25, 25), ext: forme(25, 25),
    pronostic: { homeScorePred: 25, awayScorePred: 25 },
  });
  assert.equal(a.desaccord, false);
  assert.match(a.message, /nul/i);
});

test('les cases vides ne sont pas commentées', () => {
  const { lignes } = avisJournee({
    matchs: duo,
    forme: formeEquilibree,
    pronostics: { 1: { homeScorePred: 28, awayScorePred: 22 } },
  });
  assert.deepEqual(lignes.map((l) => l.matchId), [1]);
});

test('aucun pronostic, aucun verdict', () => {
  const { lignes, verdict: v } = avisJournee({ matchs: duo, forme: formeEquilibree });
  assert.deepEqual(lignes, []);
  assert.equal(v, null);
});

test('la pire réplique demande un échantillon', () => {
  // Deux matchs, deux désaccords : Bob commente, mais ne va pas jusqu'à
  // l'accusation réservée aux journées entières.
  const petit = verdict([
    { ecart: 30, desaccord: true, moi: { home: 10, away: 40 }, bob: { home: 28, away: 22 } },
    { ecart: 30, desaccord: true, moi: { home: 10, away: 40 }, bob: { home: 28, away: 22 } },
  ]);
  assert.doesNotMatch(petit, /championnat/);
});

test('quatre vainqueurs contestés sur sept déclenchent la pire réplique', () => {
  const { verdict: v } = avisJournee({
    matchs: sept,
    forme: formeSept,
    pronostics: grille([[10, 30], [10, 30], [10, 30], [10, 30], [28, 22], [28, 22], [28, 22]]),
  });
  assert.match(v, /championnat/);
});

test('un biais systématique est relevé pour lui-même', () => {
  // Même vainqueur partout, mais des totaux très supérieurs : la moyenne des
  // écarts seule ne dirait pas de quoi il s'agit.
  const { verdict: v } = avisJournee({
    matchs: sept,
    forme: formeSept,
    pronostics: grille(Array.from({ length: 7 }, () => [45, 35])),
  });
  assert.match(v, /ouverts/);
});

test('un biais dans l\'autre sens aussi', () => {
  const { verdict: v } = avisJournee({
    matchs: sept,
    forme: formeSept,
    pronostics: grille(Array.from({ length: 7 }, () => [13, 7])),
  });
  assert.match(v, /fermés/);
});

test('une grille proche de Bob est reconnue comme telle', () => {
  const { verdict: v } = avisJournee({
    matchs: sept,
    forme: formeSept,
    pronostics: grille(Array.from({ length: 7 }, () => [29, 21])),
  });
  assert.match(v, /d’accord sur à peu près tout/);
});

test('chaque ligne porte les deux scores, pour que l\'écran puisse les montrer', () => {
  const { lignes } = avisJournee({
    matchs: duo,
    forme: formeEquilibree,
    pronostics: { 1: { homeScorePred: 31, awayScorePred: 19 } },
  });
  assert.deepEqual(lignes[0].moi, { home: 31, away: 19 });
  assert.deepEqual(lignes[0].bob, { home: 28, away: 22 });
});
