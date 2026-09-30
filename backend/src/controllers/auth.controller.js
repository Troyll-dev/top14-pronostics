const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { validationResult } = require('express-validator');
const { estAdmin } = require('../middleware/admin.middleware');

const prisma = new PrismaClient();

const AVATAR_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316',
];

/**
 * Ce qu'on renvoie d'un utilisateur a la connexion et a l'inscription.
 *
 * La liste etait plus courte : identifiant, pseudo, adresse, couleur. Il y
 * manquait les reglages de courriel et l'etat de pause, si bien que la page de
 * profil, juste apres une connexion et avant le premier appel a `/auth/me`,
 * montrait ses cases cochees par defaut — y compris a quelqu'un qui venait de
 * tout couper. Bref, quelques secondes pendant lesquelles l'ecran contredisait
 * la base.
 *
 * Ecrite une fois et partagee par les deux routes : c'est la seule facon qu'une
 * troisieme colonne ajoutee un jour n'apparaisse pas dans l'une et pas dans
 * l'autre.
 */
const profilPublic = (user) => ({
  id: user.id,
  username: user.username,
  email: user.email,
  avatarColor: user.avatarColor,
  initials: user.initials,
  avatarRing: user.avatarRing,
  mailRappels: user.mailRappels,
  mailBilan: user.mailBilan,
  enPause: user.enPause,
  // Calcule, jamais stocke : la liste des administrateurs vit dans
  // l'environnement. L'ecran s'en sert pour ne pas proposer une page qui lui
  // sera refusee — la vraie porte est cote serveur, celle-ci n'est que de la
  // politesse.
  admin: estAdmin(user),
});

const generateToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

exports.register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { username, email, password } = req.body;
  try {
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });
    if (existing) {
      return res.status(409).json({ error: 'Email ou pseudo déjà utilisé' });
    }

    const hashed = await bcrypt.hash(password, 12);
    const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    const user = await prisma.user.create({
      data: { username, email, password: hashed, avatarColor: color },
    });

    const token = generateToken(user.id);
    res.status(201).json({ token, user: profilPublic(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

exports.login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Identifiants incorrects' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Identifiants incorrects' });

    const token = generateToken(user.id);
    res.json({ token, user: profilPublic(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * `req.user` est l'enregistrement complet, pose par le middleware
 * d'authentification. On en retire le mot de passe et on renvoie le reste :
 * toute colonne ajoutee au modele arrive donc ici sans qu'on ait rien a
 * changer, ce qui est exactement ce qu'on veut d'une route « qui suis-je ».
 */
exports.me = async (req, res) => {
  const { password, ...user } = req.user;
  res.json({ ...user, admin: estAdmin(req.user) });
};
