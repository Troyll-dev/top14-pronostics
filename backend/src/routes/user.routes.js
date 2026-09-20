const router = require('express').Router();
const { getAvatar, updateMe } = require('../controllers/user.controller');
const { authenticate } = require('../middleware/auth.middleware');

// Sans authentification : une balise <img> ne peut pas porter de jeton.
router.get('/:id/avatar', getAvatar);

router.patch('/me', authenticate, updateMe);

module.exports = router;
