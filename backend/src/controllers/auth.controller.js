const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { validationResult } = require('express-validator');
const { estAdmin } = require('../middleware/admin.middleware');
const verification = require('../services/verification.service');
const bannissement = require('../services/bannissement.service');
const bobSalon = require('../services/bob-salon.service');

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
 * l'autre. `emailVerifie` en est la preuve immediate : ajoute ici, il arrive
 * des la premiere milliseconde, et le bandeau de verification ne clignote donc
 * pas apres coup.
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
  emailVerifie: user.emailVerifie,
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
    /**
     * La porte d'entree.
     *
     * Le controle est ici et nulle part ailleurs : c'est le seul endroit ou un
     * compte se cree. La connexion, elle, n'en tient pas compte — bannir une
     * adresse ferme l'inscription, cela ne desactive pas un compte existant.
     * Pour celui-la il y a la pause et la suppression.
     *
     * Le message de refus est volontairement sobre et ne dit pas « vous etes
     * banni » : la personne concernee le sait deja, et quelqu'un qui tomberait
     * la par hasard — une adresse bannie puis reattribuee, ca existe — n'a pas
     * besoin d'etre accuse. Il donne de quoi te joindre, ce qui est la seule
     * suite utile.
     */
    const porteFermee = await bannissement.bannie(email);
    if (porteFermee) {
      return res.status(403).json({
        error: 'Cette adresse ne peut pas creer de compte. Contacte l\'organisateur si c\'est une erreur.',
      });
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

    /**
     * Le courriel de verification part, mais l'inscription ne l'attend pas.
     *
     * Deux raisons de ne pas mettre `await` devant et de ne pas laisser une
     * erreur remonter. La premiere est le temps : l'envoi prend parfois deux
     * secondes, et ce sont deux secondes pendant lesquelles quelqu'un qui vient
     * de cliquer sur « Creer mon compte » regarde un bouton qui ne repond pas.
     * La seconde est plus importante : si Brevo est en panne, l'inscription
     * echouerait alors que le compte est deja cree en base — le joueur verrait
     * une erreur, reessaierait, et se heurterait a « pseudo deja utilise ».
     *
     * Le compte existe, le joueur entre, et le bandeau lui dira que son adresse
     * n'est pas confirmee avec de quoi redemander un lien. Rien n'est perdu.
     */
    verification.envoyer(user).then((r) => {
      if (!r.envoye) console.error(`[verification] ${user.username} : ${r.raison}`);
    });

    /**
     * Et Bob annonce l'arrivee au Comptoir, sans `await` lui non plus.
     *
     * Meme raison que pour le courriel : l'inscription ne doit dependre de rien
     * d'accessoire. Un salon indisponible ne doit pas empecher quelqu'un
     * d'entrer, et le service ne jette jamais de toute facon.
     *
     * C'est le seul endroit d'ou part ce message, et c'est voulu : il annonce
     * une arrivee, pas une connexion. Le jour ou l'inscription passera par une
     * validation de ta part, c'est ici que la ligne se deplacera — l'annonce
     * devra attendre que le joueur soit vraiment accepte.
     */
    bobSalon.bienvenue(user);

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

/**
 * Confirmation depuis le lien recu par courriel.
 *
 * Route publique, et ce n'est pas un oubli : le lien s'ouvre souvent depuis le
 * telephone alors qu'on s'est inscrit depuis l'ordinateur, donc sans session.
 * Exiger une connexion ici rendrait la confirmation penible precisement pour
 * ceux qui en ont le plus besoin.
 *
 * Le jeton suffit a prouver qu'on releve la boite : c'est tout ce qu'on
 * verifie, et il ne donne acces a rien d'autre.
 *
 * Toujours 200, meme en cas d'echec, avec un `ok` et un motif : l'ecran a
 * quatre phrases a dire — confirme, deja confirme, lien expire, lien inconnu —
 * et un code d'erreur HTTP n'en porte aucune.
 */
exports.confirmerEmail = async (req, res) => {
  try {
    const r = await verification.confirmer(req.body?.jeton);
    res.json(r);
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, raison: 'serveur' });
  }
};

/**
 * Redemander un lien, et au besoin corriger l'adresse.
 *
 * Les deux dans la meme route, parce que c'est le meme geste vu du joueur :
 * « je n'ai rien recu ». Tantot l'adresse est bonne et le courriel s'est perdu,
 * tantot elle est fautive — et dans ce second cas, renvoyer un lien a la meme
 * adresse ne servirait a rien. Le bandeau affiche donc l'adresse, modifiable,
 * et cette route accepte la nouvelle.
 *
 * Changer d'adresse remet `emailVerifie` a faux : la nouvelle n'est pas plus
 * prouvee que l'ancienne tant que personne n'a clique.
 *
 * Deux refus : une adresse deja prise par un autre compte, et une adresse
 * identique a l'actuelle quand le compte est deja verifie — ce dernier cas
 * n'arrive pas depuis le bandeau, qui ne s'affiche pas alors, mais une route
 * ne doit pas se fier a l'ecran qui l'appelle.
 */
exports.renvoyerVerification = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    let user = req.user;
    const demandee = (req.body?.email || '').trim().toLowerCase();

    if (demandee && demandee !== user.email.toLowerCase()) {
      const prise = await prisma.user.findFirst({
        where: { email: { equals: demandee, mode: 'insensitive' }, NOT: { id: user.id } },
      });
      if (prise) return res.status(409).json({ error: 'Cette adresse est déjà utilisée' });

      user = await prisma.user.update({
        where: { id: user.id },
        data: { email: demandee, emailVerifie: false, emailVerifieAt: null },
      });
    } else if (user.emailVerifie) {
      return res.status(400).json({ error: 'Cette adresse est déjà confirmée' });
    }

    const r = await verification.envoyer(user);
    if (!r.envoye) {
      console.error(`[verification] renvoi ${user.username} : ${r.raison}`);
      return res.status(502).json({ error: "L'envoi a échoué, réessaie dans un moment" });
    }

    res.json({ ok: true, email: user.email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};
