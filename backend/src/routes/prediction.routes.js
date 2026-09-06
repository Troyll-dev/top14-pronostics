const router = require('express').Router();
const { upsertPrediction, getMyPredictions, getRoundPredictions } = require('../controllers/prediction.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.post('/', authenticate, upsertPrediction);
router.get('/me', authenticate, getMyPredictions);
router.get('/round/:round', authenticate, getRoundPredictions);

module.exports = router;
