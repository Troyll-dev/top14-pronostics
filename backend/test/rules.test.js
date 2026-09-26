const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEPUIS, MULT_JOKER, MULT_AFFICHE,
  actif, multiplicateur, afficheDeLaJournee, journeeCommencee,
} = require('../src/services/rules');
const { pointsFor } = require('../src/services/scoring');

test('les multiplicateurs ne s\'appliquent pas avant la journee d\'entree en vigueur', () => {
  assert.equal(actif(DEPUIS - 1), false);
  assert.equal(actif(DEPUIS), true);
  assert.equal(actif(DEPUIS + 1), true);

  // Un joker pose sur une journee anterieure ne doit rien multiplier : les
  // points d'avant ont ete marques sous d'autres regles.
  assert.equal(multiplicateur({ joker: true, round: DEPUIS - 1 }), 1);
  assert.equal(multiplicateur({ affiche: true, round: DEPUIS - 1 }), 1);
});

test('joker x2, affiche x3, rien x1', () => {
  assert.equal(multiplicateur({ round: DEPUIS }), 1);
  assert.equal(multiplicateur({ joker: true, round: DEPUIS }), MULT_JOKER);
  assert.equal(multiplicateur({ affiche: true, round: DEPUIS }), MULT_AFFICHE);
  assert.equal(MULT_JOKER, 2);
  assert.equal(MULT_AFFICHE, 3);
});

/**
 * Le joker est interdit sur le match de la semaine ; c'est verifie a
 * l'ecriture. Ce test couvre le cas ou une donnee incoherente arriverait quand
 * meme en base — une reprise manuelle, un ancien enregistrement — et verifie
 * qu'elle donne un resultat previsible au lieu d'un x6 surprise.
 */
test('joker et affiche ensemble : x3, jamais x6', () => {
  assert.equal(multiplicateur({ joker: true, affiche: true, round: DEPUIS }), MULT_AFFICHE);
  assert.notEqual(multiplicateur({ joker: true, affiche: true, round: DEPUIS }), MULT_JOKER * MULT_AFFICHE);
});

test('une journee inconnue ne multiplie rien', () => {
  assert.equal(multiplicateur({ joker: true, round: undefined }), 1);
  assert.equal(multiplicateur({ joker: true, round: null }), 1);
  assert.equal(multiplicateur(), 1);
});

test('le plafond : un pronostic ne peut pas rapporter plus de 9 points', () => {
  const max = 3 * MULT_AFFICHE;
  for (const round of [DEPUIS - 1, DEPUIS, DEPUIS + 10]) {
    for (const joker of [false, true]) {
      for (const affiche of [false, true]) {
        const base = pointsFor({ homeScorePred: 20, awayScorePred: 15 }, { homeScore: 20, awayScore: 15 });
        assert.ok(base * multiplicateur({ joker, affiche, round }) <= max);
      }
    }
  }
});

test('zero point reste zero, quel que soit le multiplicateur', () => {
  const base = pointsFor({ homeScorePred: 30, awayScorePred: 10 }, { homeScore: 10, awayScore: 30 });
  assert.equal(base, 0);
  assert.equal(base * multiplicateur({ joker: true, round: DEPUIS }), 0);
  assert.equal(base * multiplicateur({ affiche: true, round: DEPUIS }), 0);
});

/* ------------------------------------------------------------------ */

const m = (id, iso) => ({ id, kickoff: iso ? new Date(iso) : null });

test('l\'affiche est le match qui commence le plus tard', () => {
  const journee = [
    m(1, '2026-10-10T12:30:00Z'),
    m(2, '2026-10-10T14:35:00Z'),
    m(3, '2026-10-11T19:05:00Z'),   // dimanche soir
    m(4, '2026-10-10T19:00:00Z'),
  ];
  assert.equal(afficheDeLaJournee(journee).id, 3);
});

test('l\'affiche ne depend pas de l\'ordre de la liste', () => {
  const journee = [
    m(3, '2026-10-11T19:05:00Z'),
    m(1, '2026-10-10T12:30:00Z'),
    m(2, '2026-10-10T14:35:00Z'),
  ];
  assert.equal(afficheDeLaJournee(journee).id, 3);
});

/**
 * La stabilite. Si deux rencontres partagent le dernier horaire, il faut que la
 * reponse soit la meme d'un appel a l'autre : une affiche qui changerait toute
 * seule entre deux chargements de page serait incomprehensible pour les
 * joueurs, et pire encore apres qu'ils ont place leur joker.
 */
test('a horaire egal, c\'est toujours le meme match qui est choisi', () => {
  const a = m(7, '2026-10-11T19:05:00Z');
  const b = m(2, '2026-10-11T19:05:00Z');
  assert.equal(afficheDeLaJournee([a, b]).id, 2);
  assert.equal(afficheDeLaJournee([b, a]).id, 2);
});

test('sans horaire connu, pas d\'affiche plutot qu\'une affiche au hasard', () => {
  assert.equal(afficheDeLaJournee([]), null);
  assert.equal(afficheDeLaJournee(null), null);
  assert.equal(afficheDeLaJournee([m(1, null), m(2, null)]), null);
});

test('les matchs sans horaire sont ignores, pas retenus', () => {
  const journee = [m(1, null), m(2, '2026-10-10T14:35:00Z')];
  assert.equal(afficheDeLaJournee(journee).id, 2);
});

/* ------------------------------------------------------------------ */

test('une journee est commencee des le premier coup d\'envoi passe', () => {
  const t = Date.parse('2026-10-10T15:00:00Z');
  const journee = [m(1, '2026-10-10T12:30:00Z'), m(2, '2026-10-11T19:05:00Z')];

  assert.equal(journeeCommencee(journee, t), true);
  assert.equal(journeeCommencee(journee, Date.parse('2026-10-10T10:00:00Z')), false);
  // pile a l'heure du coup d'envoi : commencee
  assert.equal(journeeCommencee(journee, Date.parse('2026-10-10T12:30:00Z')), true);
});

test('une journee vide n\'est pas commencee', () => {
  assert.equal(journeeCommencee([], Date.now()), false);
  assert.equal(journeeCommencee(null, Date.now()), false);
});
