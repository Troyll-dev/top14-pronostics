const router = require('express').Router();
const {
  getMessages, getUnread, createMessage, deleteMessage,
} = require('../controllers/message.controller');
const { authenticate } = require('../middleware/auth.middleware');

// Le salon est reserve aux joueurs connectes, y compris en lecture.
router.get('/', authenticate, getMessages);
router.get('/unread', authenticate, getUnread);
router.post('/', authenticate, createMessage);
router.delete('/:id', authenticate, deleteMessage);

module.exports = router;
