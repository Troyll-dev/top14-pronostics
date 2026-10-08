const router = require('express').Router();
const {
  upsertPrediction,
  setJoker,
  lancerBob,
  avisBob,
  effacerJournee,
  getRoundRules,
  getMyPredictions,
  getRoundPredictions,
  getMatchPredictions,
} = require('../controllers/prediction.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.post('/', authenticate, upsertPrediction);

// Le joker : poser, déplacer ou retirer, selon là où il est déjà.
router.post('/joker', authenticate, setJoker);

// Bob le poulpe : remplir les cases vides d'une journée. En POST parce qu'il
// écrit, et sous `/predictions` parce que ce qu'il produit sont des pronostics
// ordinaires — pas une ressource à part, pas un régime à part.
router.post('/bob', authenticate, lancerBob);

// L'avis de Bob sur mes pronostics d'une journée. Même précaution d'ordre que
// « regles » : avant `/:round`, sinon « avis » passerait pour un numéro.
router.get('/round/:round/avis', authenticate, avisBob);

// L'état des règles d'une journée : multiplicateurs actifs, match de la
// semaine, et où est mon joker. Avant `/:round` plus bas, sinon Express
// prendrait « regles » pour un numéro de journée.
router.get('/round/:round/regles', authenticate, getRoundRules);

// Tout effacer sur une journée, pour repartir de cases vides. En DELETE sur la
// collection : c'est bien une suppression de ressources, et le verbe suffit à
// la distinguer du GET de la même adresse.
router.delete('/round/:round', authenticate, effacerJournee);

router.get('/me', authenticate, getMyPredictions);
router.get('/round/:round', authenticate, getRoundPredictions);
router.get('/match/:matchId', authenticate, getMatchPredictions);

module.exports = router;
