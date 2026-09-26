const router = require('express').Router();
const {
  upsertPrediction,
  setJoker,
  getRoundRules,
  getMyPredictions,
  getRoundPredictions,
  getMatchPredictions,
} = require('../controllers/prediction.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.post('/', authenticate, upsertPrediction);

// Le joker : poser, déplacer ou retirer, selon là où il est déjà.
router.post('/joker', authenticate, setJoker);

// L'état des règles d'une journée : multiplicateurs actifs, match de la
// semaine, et où est mon joker. Avant `/:round` plus bas, sinon Express
// prendrait « regles » pour un numéro de journée.
router.get('/round/:round/regles', authenticate, getRoundRules);

router.get('/me', authenticate, getMyPredictions);
router.get('/round/:round', authenticate, getRoundPredictions);
router.get('/match/:matchId', authenticate, getMatchPredictions);

module.exports = router;
