const router = require('express').Router();
const { body } = require('express-validator');
const {
  register,
  login,
  me,
  confirmerEmail,
  renvoyerVerification,
} = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.post('/register', [
  body('username').trim().isLength({ min: 3, max: 20 }).withMessage('Pseudo : 3 à 20 caractères'),
  body('email').isEmail().withMessage('Email invalide'),
  body('password').isLength({ min: 6 }).withMessage('Mot de passe : 6 caractères minimum'),
], register);

router.post('/login', [
  body('email').isEmail(),
  body('password').notEmpty(),
], login);

router.get('/me', authenticate, me);

/**
 * Confirmation de l'adresse : publique, par le jeton recu par courriel.
 *
 * Sans `authenticate`, volontairement. Le lien s'ouvre le plus souvent depuis
 * le telephone alors qu'on s'est inscrit depuis l'ordinateur : exiger une
 * session ici ajouterait une connexion a franchir avant de pouvoir confirmer.
 * Le jeton est la preuve, et il ne permet rien d'autre.
 */
router.post('/confirmer', [
  body('jeton').isString().notEmpty(),
], confirmerEmail);

/**
 * Redemander un lien, avec une adresse corrigee si besoin.
 *
 * Celle-ci demande une session : on y change l'adresse du compte, donc il faut
 * savoir de quel compte il s'agit — et le bandeau qui l'appelle n'est affiche
 * qu'a quelqu'un de connecte.
 */
router.post('/verification/renvoyer', authenticate, [
  body('email').optional().isEmail().withMessage('Adresse invalide'),
], renvoyerVerification);

module.exports = router;
