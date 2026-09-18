const router = require('express').Router();
const {
  upsertPrediction,
  getMyPredictions,
  getRoundPredictions,
  getMatchPredictions,
} = require('../controllers/prediction.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.post('/', authenticate, upsertPrediction);
router.get('/me', authenticate, getMyPredictions);
router.get('/round/:round', authenticate, getRoundPredictions);
router.get('/match/:matchId', authenticate, getMatchPredictions);

module.exports = router;
