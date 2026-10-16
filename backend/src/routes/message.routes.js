const router = require('express').Router();
const {
  getMessages, getFils, getUnread, marquerLu, createMessage, deleteMessage,
} = require('../controllers/message.controller');
const { authenticate } = require('../middleware/auth.middleware');

/**
 * Le Comptoir et les messages prives, reserves aux joueurs connectes, y compris
 * en lecture.
 *
 * `/fils` et `/unread` sont declarees avant `/:id` — qui n'existe qu'en
 * suppression ici, mais la regle vaut d'etre tenue partout : Express essaie les
 * routes dans l'ordre, et une route litterale placee apres une route a
 * parametre finirait un jour par etre lue comme un identifiant.
 */
router.get('/fils', authenticate, getFils);
router.get('/unread', authenticate, getUnread);
router.post('/lu', authenticate, marquerLu);

router.get('/', authenticate, getMessages);
router.post('/', authenticate, createMessage);
router.delete('/:id', authenticate, deleteMessage);

module.exports = router;
