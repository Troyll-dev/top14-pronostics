const router = require('express').Router();
const { getMatches, getRounds, createMatch, updateResult, getTeams } = require('../controllers/match.controller');
const { authenticate } = require('../middleware/auth.middleware');

// Routes publiques
router.get('/', (req, res, next) => {
  // Optionnellement injecter l'user si token présent (pour les pronostics perso)
  const authHeader = req.headers.authorization;
  if (authHeader) {
    return authenticate(req, res, next);
  }
  next();
}, getMatches);

router.get('/rounds', getRounds);
router.get('/teams', getTeams);

// Routes protégées
router.post('/', authenticate, createMatch);
router.patch('/:id/result', authenticate, updateResult);

module.exports = router;
