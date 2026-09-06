const router = require('express').Router();
const { getLeaderboard, getRoundLeaderboard } = require('../controllers/leaderboard.controller');

router.get('/', getLeaderboard);
router.get('/round/:round', getRoundLeaderboard);

module.exports = router;
