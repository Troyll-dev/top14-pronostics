const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { BOB_AVATAR_WEBP_BASE64 } = require('./bob-avatar');

const prisma = new PrismaClient();

/**
 * Bob au Comptoir.
 *
 * ---------------------------------------------------------------------------
 * POURQUOI BOB A UN COMPTE
 * ---------------------------------------------------------------------------
 *
 * Un message du salon exige un auteur : la table `messages` porte une cle vers
 * `users`, et c'est elle qui fournit la pastille, la couleur et le pseudo
 * affiches a cote de chaque ligne. Pour qu'un mot de bienvenue apparaisse dans
 * le Comptoir, il fallait donc choisir qui le signe.
 *
 * Trois possibilites. Le faire signer par le nouveau venu — c'est-a-dire lui
 * faire dire bonjour a sa propre arrivee, ce qui est faux et un peu ridicule.
 * Le faire signer par l'administrateur — c'est-a-dire te faire dire des choses
 * que tu n'as pas ecrites. Ou ouvrir un compte a Bob, qui existe deja comme
 * personnage depuis le bouton « prono automatique ».
 *
 * La troisieme a un cout — une colonne de plus sur `users`, un filtre dans le
 * classement — et deux avantages qui le payent largement. Le salon n'a rien a
 * apprendre : Bob y est un auteur ordinaire, avec sa photo, exactement comme
 * les huit autres. Et le jour ou l'on voudra qu'il parle davantage — commenter
 * ses propres pronostics, saluer le vainqueur du lundi — tout est deja en
 * place.
 *
 * ---------------------------------------------------------------------------
 * UN COMPTE INERTE
 * ---------------------------------------------------------------------------
 *
 * Son mot de passe est trente-deux octets tires au hasard, haches puis
 * oublies : personne ne peut se connecter en Bob, pas meme nous. Il ne recoit
 * aucun courriel, il est en pause, son adresse est marquee verifiee pour ne pas
 * figurer dans la liste des retardataires, et le marqueur `bot` le sort du
 * classement et de la liste d'administration.
 *
 * `compte()` le cree au premier besoin plutot qu'une migration SQL : un compte
 * qui se fabrique tout seul ne peut pas etre oublie lors d'un deploiement, et
 * la fonction est idempotente — elle rend celui qui existe deja.
 */

const BOB = {
  username: 'Bob le poulpe',
  email: process.env.BOB_EMAIL || 'bob@top14-pronostics.local',
  avatarColor: '#7C3AED',
  initials: 'BOB',
};

/** Le compte de Bob, cree au premier appel puis retrouve. */
async function compte() {
  const existant = await prisma.user.findFirst({ where: { bot: true } });
  if (existant) return existant;

  const motDePasse = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);

  const bob = await prisma.user.create({
    data: {
      username: BOB.username,
      email: BOB.email,
      password: motDePasse,
      avatarColor: BOB.avatarColor,
      initials: BOB.initials,
      bot: true,
      enPause: true,
      mailRappels: false,
      mailBilan: false,
      emailVerifie: true,
      emailVerifieAt: new Date(),
    },
  });

  // Sa photo, dans la table ou vivent les autres. Si elle echoue, Bob parle
  // quand meme avec sa pastille violette : un avatar manquant n'est pas une
  // raison de ne pas souhaiter la bienvenue.
  try {
    await prisma.userAvatar.create({
      data: {
        userId: bob.id,
        data: Buffer.from(BOB_AVATAR_WEBP_BASE64, 'base64'),
        mimeType: 'image/webp',
      },
    });
  } catch (err) {
    console.error('[bob] photo de profil non posee :', err.message);
  }

  return bob;
}

/**
 * Ce que Bob dit quand quelqu'un arrive.
 *
 * Plusieurs formulations, tirees au sort. Ce n'est pas de la coquetterie : les
 * huit joueurs actuels sont arrives en quelques jours, et verront donc ces
 * messages a la suite dans l'historique du salon. Huit fois la meme phrase,
 * c'est un robot ; quatre phrases differentes, c'est un personnage.
 *
 * Elles disent toutes la meme chose — qui vient d'arriver, et quoi faire en
 * premier — parce qu'un message d'accueil qui n'indique pas la premiere action
 * n'accueille personne.
 */
const PHRASES = [
  (n) => `${n} vient de pousser la porte. Bienvenue ! Les pronos de la journée en cours t'attendent dans « Mes pronos » — et si tu es en retard, je peux te donner un coup de tentacule.`,
  (n) => `Une chope pour ${n}, qui nous rejoint ! Commence par « Mes pronos », pose tes scores, et n'oublie pas le joker : il double les points d'un match de ton choix.`,
  (n) => `${n} s'installe au comptoir. Bienvenue ! Première chose à faire : « Mes pronos ». Les autres t'y attendent déjà, et ils ne feront pas de cadeau.`,
  (n) => `Bienvenue ${n} ! Je suis Bob, le poulpe de service : je pronostique à la place de ceux qui n'ont pas le temps. Toi, tu as le temps — va poser tes scores dans « Mes pronos ».`,
];

/**
 * Annonce l'arrivee d'un joueur dans le salon.
 *
 * Ne jette jamais. Elle est appelee depuis l'inscription, et une inscription ne
 * doit pas echouer parce qu'un message d'accueil n'est pas parti : le compte
 * serait cree, le joueur verrait une erreur, reessaierait, et se heurterait a
 * « pseudo deja utilise ». Meme raisonnement que pour le courriel de
 * verification, et meme traitement.
 */
async function bienvenue(nouveau) {
  try {
    const bob = await compte();
    const phrase = PHRASES[Math.floor(Math.random() * PHRASES.length)](nouveau.username);

    await prisma.message.create({
      data: { userId: bob.id, body: phrase.slice(0, 1000) },
    });

    return { ok: true };
  } catch (err) {
    console.error('[bob] bienvenue non publiee :', err.message);
    return { ok: false, raison: err.message };
  }
}

module.exports = { compte, bienvenue, BOB };
