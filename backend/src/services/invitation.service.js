/**
 * Les invitations.
 *
 * L'inscription n'est plus ouverte a qui connait l'adresse du site : il faut un
 * lien, et chaque lien ne cree qu'un compte. Ce n'est pas seulement une porte
 * fermee — c'est ce qui rend inutile la confirmation d'adresse dont on parlait.
 * Une invitation envoyee a une adresse mal ecrite n'arrive jamais, donc le
 * compte ne se cree pas : l'adresse est prouvee par construction plutot que
 * verifiee apres coup.
 *
 * Deux facons d'inviter, et elles se valent :
 *
 *   - le lien seul, a coller dans une conversation. L'invite saisit alors son
 *     adresse lui-meme ;
 *   - le courriel, ou l'on saisit l'adresse a l'avance. L'inscription verifie
 *     alors qu'elle correspond, sinon un lien retransmis ouvrirait la porte a
 *     n'importe qui.
 *
 * Comme pour les jetons de mot de passe, seule l'empreinte du jeton est
 * stockee : le lien lui-meme n'existe qu'une fois, dans le courriel ou dans le
 * presse-papier de celui qui invite. Une fuite de la base ne donne rien
 * d'utilisable.
 */

const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const mailer = require('./mailer.service');

const prisma = new PrismaClient();

/**
 * Quinze jours.
 *
 * Assez pour qu'un ami parte en vacances et revienne, trop peu pour qu'un lien
 * oublie dans une conversation de groupe serve encore dans deux saisons. Un
 * lien perime se remplace en un clic, ce qui n'est pas le cas d'un compte cree
 * par quelqu'un qu'on n'attendait plus.
 */
const DUREE_JOURS = 15;

/** Combien d'invitations en attente un joueur peut avoir. */
const MAX_EN_ATTENTE = 10;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const empreinte = (jeton) => crypto.createHash('sha256').update(String(jeton)).digest('hex');

const normaliser = (email) => String(email || '').trim().toLowerCase();

/**
 * L'inscription est-elle reservee aux invites ?
 *
 * Fermee par defaut, et c'est le bon defaut : une application entre amis dont
 * la page d'inscription est ouverte finit par recevoir des comptes qu'on n'a
 * pas invites. `INSCRIPTION=ouverte` retablit l'ancien comportement sans
 * redeployer, au cas ou tu voudrais ouvrir un moment.
 */
const surInvitation = () => process.env.INSCRIPTION !== 'ouverte';

/** L'adresse du lien, cote site : c'est la page d'inscription qui le recoit. */
function lienDeJeton(jeton) {
  const base = (process.env.APP_URL || '').replace(/\/$/, '');
  return `${base}/register?invitation=${jeton}`;
}

/**
 * Cree une invitation et rend le lien en clair.
 *
 * Le lien n'est rendu qu'ici, une seule fois. Il n'est stocke nulle part et ne
 * peut donc pas etre relu plus tard — s'il est perdu, on en cree un autre, ce
 * qui coute un clic et ne laisse pas trainer un lien valable dans une page.
 */
async function creer({ invitedById, email = null, message = null }) {
  const adresse = email ? normaliser(email) : null;
  if (adresse && !EMAIL_RE.test(adresse)) {
    throw Object.assign(new Error('Adresse invalide'), { statut: 400 });
  }

  if (adresse) {
    const deja = await prisma.user.findUnique({ where: { email: adresse }, select: { id: true } });
    if (deja) throw Object.assign(new Error('Cette adresse a déjà un compte'), { statut: 409 });
  }

  const enAttente = await prisma.invitation.count({
    where: { invitedById, usedAt: null, expiresAt: { gt: new Date() } },
  });
  if (enAttente >= MAX_EN_ATTENTE) {
    throw Object.assign(
      new Error('Trop d\'invitations en attente — laisse-les être utilisées ou expirer'),
      { statut: 429 }
    );
  }

  const jeton = crypto.randomBytes(24).toString('base64url');

  const invitation = await prisma.invitation.create({
    data: {
      tokenHash: empreinte(jeton),
      email: adresse,
      message: message ? String(message).trim().slice(0, 280) || null : null,
      invitedById,
      expiresAt: new Date(Date.now() + DUREE_JOURS * 24 * 3600 * 1000),
    },
    include: { invitedBy: { select: { username: true } } },
  });

  return { invitation, jeton, lien: lienDeJeton(jeton) };
}

/**
 * Le jeton est-il utilisable, et que sait-on de l'invitation ?
 *
 * Rend un objet sobre : de quoi accueillir la personne par le nom de celui qui
 * l'invite, et pre-remplir son adresse si elle est connue. Jamais l'empreinte
 * ni l'identifiant, qui ne servent a rien de l'autre cote.
 */
async function lire(jeton) {
  if (!jeton) return null;
  const inv = await prisma.invitation.findUnique({
    where: { tokenHash: empreinte(jeton) },
    include: { invitedBy: { select: { username: true } } },
  });
  if (!inv) return null;
  if (inv.usedAt) return { valide: false, raison: 'deja-utilisee' };
  if (inv.expiresAt < new Date()) return { valide: false, raison: 'expiree' };

  return {
    valide: true,
    parrain: inv.invitedBy.username,
    email: inv.email,
    message: inv.message,
    expireLe: inv.expiresAt,
  };
}

/**
 * Consomme l'invitation au moment ou le compte est cree.
 *
 * `updateMany` avec `usedAt: null` dans le filtre plutot qu'un `update` simple :
 * c'est la base qui tranche si deux inscriptions arrivent en meme temps sur le
 * meme lien. La seconde ne modifie aucune ligne et repart en erreur, au lieu de
 * creer un second compte sur une invitation unique.
 */
async function consommer(jeton, userId) {
  const { count } = await prisma.invitation.updateMany({
    where: { tokenHash: empreinte(jeton), usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date(), usedById: userId },
  });
  return count === 1;
}

/** Ce que quelqu'un voit de ses propres invitations. Jamais de jeton. */
async function mesInvitations(invitedById) {
  const lignes = await prisma.invitation.findMany({
    where: { invitedById },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { usedBy: { select: { username: true } } },
  });

  const maintenant = new Date();
  return lignes.map((i) => ({
    id: i.id,
    email: i.email,
    creeLe: i.createdAt,
    expireLe: i.expiresAt,
    etat: i.usedAt ? 'utilisee' : i.expiresAt < maintenant ? 'expiree' : 'en-attente',
    parQui: i.usedBy?.username || null,
  }));
}

/** Annule une invitation encore en attente. On ne supprime que les siennes. */
async function annuler(id, invitedById) {
  const { count } = await prisma.invitation.deleteMany({
    where: { id, invitedById, usedAt: null },
  });
  return count === 1;
}

/**
 * Le courriel d'invitation.
 *
 * Volontairement court. Il doit donner envie et dire quoi faire, pas expliquer
 * le reglement — celui-ci est sur la page d'accueil, que le lien traverse de
 * toute facon.
 */
async function envoyer({ email, lien, parrain, message }) {
  const intro =
    `<b>${parrain}</b> t'invite à rejoindre sa bande de pronostiqueurs du Top 14.` +
    (message ? `<br><br><i>« ${message} »</i>` : '') +
    `<br><br>Le principe : chacun pronostique le score des sept matchs de la journée, ` +
    `les points tombent le lundi, et le dernier paie la tournée.`;

  await mailer.send({
    to: email,
    subject: `${parrain} t'invite à pronostiquer le Top 14`,
    html: mailer.wrap(
      'Rejoins la bande',
      intro,
      'Créer mon compte',
      lien,
      `Ce lien t'est personnel et ne sert qu'une fois. Il reste valable ${DUREE_JOURS} jours. ` +
      `Si tu ne vois pas de quoi il s'agit, ignore ce message : rien ne sera créé.`
    ),
    text:
      `${parrain} t'invite a rejoindre sa bande de pronostiqueurs du Top 14.\n\n` +
      (message ? `« ${message} »\n\n` : '') +
      `Cree ton compte : ${lien}\n\n` +
      `Ce lien ne sert qu'une fois et reste valable ${DUREE_JOURS} jours.\n`,
  });
}

module.exports = {
  DUREE_JOURS, MAX_EN_ATTENTE,
  surInvitation, creer, lire, consommer, mesInvitations, annuler, envoyer, lienDeJeton,
};
