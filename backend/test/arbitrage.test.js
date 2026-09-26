const test = require('node:test');
const assert = require('node:assert/strict');
const {
  decide, impliedFinal, resolveTeam, LIVE_WINDOW_MS,
} = require('../src/services/results-sync.service');

/**
 * L'arbitrage entre les trois sources.
 *
 * C'est la partie du systeme qui a cause le plus de degats : une source figee
 * sur un score de 60e minute, une autre annoncant « a venir » un match joue.
 * La regle n'a de valeur que si elle tient dans les cas de desaccord, et ces
 * cas-la n'arrivent qu'une fois par saison — donc jamais pendant qu'on regarde.
 */

const H = 3600 * 1000;
const src = (source, h, a, final) => ({ source, homeScore: h, awayScore: a, final });

const maintenant = Date.now();
const ilY = (ms) => new Date(maintenant - ms);

test('aucune source chiffree : on n\'ecrit rien', () => {
  assert.equal(decide([src('lnr', null, null, false)], ilY(3 * H), maintenant), null);
  assert.equal(decide([], ilY(3 * H), maintenant), null);
});

test('une seule source definitive : son score est retenu', () => {
  const v = decide([src('lnr', 23, 29, true)], ilY(3 * H), maintenant);
  assert.equal(v.final, true);
  assert.equal(v.homeScore, 23);
  assert.equal(v.from, 'lnr');
});

test('deux sources definitives d\'accord : score definitif, les deux citees', () => {
  const v = decide([src('lnr', 23, 29, true), src('espn', 23, 29, true)], ilY(3 * H), maintenant);
  assert.equal(v.final, true);
  assert.equal(v.from, 'lnr+espn');
  assert.ok(!v.conflict);
});

/**
 * Le cas qui compte. Deux sources qui se disent toutes deux definitives et
 * ne donnent pas le meme score : l'une des deux ment. On refuse alors de
 * declarer quoi que ce soit de definitif — parce qu'un score definitif
 * declenche l'attribution des points, et qu'un point attribue a tort se
 * remarque bien plus tard que l'absence de point.
 */
test('deux sources definitives en desaccord : rien de definitif, et on le signale', () => {
  const v = decide([src('lnr', 23, 29, true), src('espn', 20, 29, true)], ilY(3 * H), maintenant);
  assert.equal(v.final, false, 'un desaccord ne doit jamais produire un score definitif');
  assert.ok(v.conflict, 'le desaccord doit etre signale');
  assert.match(v.conflict, /lnr 23-29/);
  assert.match(v.conflict, /espn 20-29/);
});

test('aucune source definitive : score provisoire, le plus avance', () => {
  // Deux relevés du meme match en cours : celui dont le total est le plus
  // eleve est le plus tardif.
  const v = decide(
    [src('lnr', 10, 7, false), src('espn', 17, 7, false)],
    ilY(1 * H),
    maintenant
  );
  assert.equal(v.final, false);
  assert.equal(v.homeScore, 17);
  assert.equal(v.from, 'espn');
});

/**
 * Quand une source ne se prononce pas (`final: null`), c'est l'heure qui
 * tranche. C'est ce repli qui a permis de ne pas dependre de la seule
 * honnetete des sources.
 */
test('source muette sur l\'etat : c\'est le temps ecoule qui tranche', () => {
  assert.equal(impliedFinal(src('x', 20, 10, null), ilY(3 * H), maintenant), true);
  assert.equal(impliedFinal(src('x', 20, 10, null), ilY(1 * H), maintenant), false);
  assert.equal(LIVE_WINDOW_MS, 2.5 * H, 'le seuil doit rester aligne sur celui de la source LNR');
});

test('une source qui dit explicitement « pas fini » est crue, meme tard', () => {
  assert.equal(impliedFinal(src('x', 20, 10, false), ilY(10 * H), maintenant), false);
});

test('une source qui dit « fini » est crue, meme tot', () => {
  assert.equal(impliedFinal(src('x', 20, 10, true), ilY(1), maintenant), true);
});

test('sans coup d\'envoi connu, on ne declare jamais definitif de soi-meme', () => {
  assert.equal(impliedFinal(src('x', 20, 10, null), null, maintenant), false);
});

/**
 * La reconnaissance des equipes. Les sources ecrivent les noms chacune a leur
 * facon ; une erreur de correspondance ecrirait un score sur la mauvaise
 * rencontre — l'erreur la plus difficile a reperer de toutes.
 */
test('reconnaissance des equipes : exacte, approximative, et refus', () => {
  const teams = [
    { id: 1, name: 'Stade Toulousain', shortName: 'ST', city: 'Toulouse' },
    { id: 2, name: 'LOU Rugby', shortName: 'LOU', city: 'Lyon' },
    { id: 3, name: 'Union Bordeaux-Begles', shortName: 'UBB', city: 'Bordeaux' },
  ];

  assert.equal(resolveTeam('Stade Toulousain', teams)?.id, 1);
  assert.equal(resolveTeam('stade toulousain', teams)?.id, 1, 'insensible a la casse');
  assert.equal(resolveTeam('Toulouse', teams)?.id, 1, 'par la ville');
  assert.equal(resolveTeam('Lyon OU', teams)?.id, 2);
  assert.equal(resolveTeam('Bordeaux-Begles', teams)?.id, 3);
  assert.equal(resolveTeam('', teams), null);
  assert.equal(resolveTeam(null, teams), null);
});

/**
 * Le piege du sigle. « LOU » se retrouve dans « Stade Tou-lou-sain » : si la
 * reconnaissance approximative acceptait les sigles, le LOU Rugby serait
 * confondu avec le Stade Toulousain, et les scores atterriraient sur la
 * mauvaise rencontre.
 */
test('un sigle ne doit pas etre reconnu par sous-chaine', () => {
  const teams = [
    { id: 1, name: 'Stade Toulousain', shortName: 'ST', city: 'Toulouse' },
    { id: 2, name: 'LOU Rugby', shortName: 'LOU', city: 'Lyon' },
  ];
  assert.equal(resolveTeam('LOU', teams)?.id, 2, 'le sigle exact reste accepte');
  assert.notEqual(resolveTeam('Toulousain', teams)?.id, 2, 'ne doit jamais tomber sur le LOU');
});
