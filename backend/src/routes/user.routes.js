const router = require('express').Router();
const {
  getAvatar, updateMe, changeEmail, changePassword,
  confirmEmail, forgotPassword, resetPassword,
} = require('../controllers/user.controller');
const { authenticate } = require('../middleware/auth.middleware');

// Sans authentification : une balise <img> ne peut pas porter de jeton.
router.get('/:id/avatar', getAvatar);

// Sans authentification non plus : on arrive ici depuis un lien recu par
// e-mail, souvent sur un autre appareil ou l'on n'est pas connecte. La preuve
// n'est pas la session, c'est le jeton a usage unique.
router.post('/confirm-email', confirmEmail);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

router.patch('/me', authenticate, updateMe);
router.patch('/me/email', authenticate, changeEmail);
router.patch('/me/password', authenticate, changePassword);

module.exports = router;
