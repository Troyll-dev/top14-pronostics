const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { validationResult } = require('express-validator');
const invitations = require('../services/invitation.service');

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
});

const generateToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

/**
 * L'inscription, desormais sur invitation.
 *
 * Trois verifications avant de creer quoi que ce soit, dans cet ordre, et
 * chacune pour une raison distincte.
 *
 * Le jeton doit etre valable : c'est la porte. Sans lui, plus personne n'entre
 * par la seule connaissance de l'adresse du site.
 *
 * Si l'invitation portait une adresse, celle saisie doit etre la meme. Sans
 * cela, un lien transmis a un tiers — volontairement ou par une conversation de
 * groupe — laisserait entrer n'importe qui, et l'adresse ne serait plus prouvee
 * du tout.
 *
 * Enfin l'invitation est consommee par une ecriture conditionnelle que la base
 * arbitre : « marque-la utilisee, mais seulement si elle ne l'est pas deja ».
 * Si deux personnes cliquent en meme temps sur le meme lien, la seconde ne
 * modifie aucune ligne et repart en erreur — le compte qu'on venait de lui
 * creer est alors efface. Un simple `update` laisserait passer les deux, et
 * c'est le genre de course qu'on ne reproduit jamais en essayant a la main.
 *
 * Elle a lieu apres la creation du compte, faute de connaitre avant
 * l'identifiant du nouveau venu.
 *
 * `INSCRIPTION=ouverte` retablit l'ancien comportement sans redeployer.
 */
exports.register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { username, email, password, invitation } = req.body;
  const exigee = invitations.surInvitation();

  try {
    let invite = null;

    if (exigee) {
      invite = await invitations.lire(invitation);
      if (!invite) {
        return res.status(403).json({
          error: 'Il faut une invitation pour créer un compte. Demande un lien à quelqu\'un de la bande.',
        });
      }
      if (!invite.valide) {
        return res.status(403).json({
          error: invite.raison === 'expiree'
            ? 'Cette invitation a expiré. Demande un nouveau lien.'
            : 'Cette invitation a déjà servi à créer un compte.',
        });
      }
      if (invite.email && invite.email !== String(email || '').trim().toLowerCase()) {
        return res.status(403).json({
          error: 'Cette invitation a été envoyée à une autre adresse.',
        });
      }
    }

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

    // Consommee apres la creation, mais de facon conditionnelle : si elle a ete
    // prise entre-temps, on efface le compte qu'on vient de creer plutot que de
    // laisser deux comptes pour une invitation. On ne peut pas la consommer
    // avant, faute de connaitre l'identifiant du nouveau venu.
    if (exigee) {
      const prise = await invitations.consommer(invitation, user.id);
      if (!prise) {
        await prisma.user.delete({ where: { id: user.id } });
        return res.status(409).json({ error: 'Cette invitation vient d\'être utilisée.' });
      }
    }

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
  res.json(user);
};
