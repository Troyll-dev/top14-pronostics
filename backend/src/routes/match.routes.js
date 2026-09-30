const router = require('express').Router();
const { getMatches, getRounds, createMatch, updateResult, getTeams, getNextRound } = require('../controllers/match.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/admin.middleware');

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
router.get('/next-round', getNextRound);
router.get('/teams', getTeams);

/**
 * Routes d'administration.
 *
 * `authenticate` ne suffisait pas, et c'etait le defaut : c'est le meme
 * middleware que pour poser un pronostic, donc n'importe lequel des joueurs
 * pouvait creer un match ou saisir un resultat. Or `updateResult` appelle
 * `calculatePoints` : saisir un score, c'est distribuer les points de tout le
 * monde, y compris les siens.
 *
 * `requireAdmin` vient apres et jamais a la place : il lit `req.user`, que seul
 * `authenticate` renseigne.
 */
router.post('/', authenticate, requireAdmin, createMatch);
router.patch('/:id/result', authenticate, requireAdmin, updateResult);

module.exports = router;
