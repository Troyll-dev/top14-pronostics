/**
 * Vérification de l'adresse à l'inscription.
 *
 * ---------------------------------------------------------------------------
 * LE PROBLÈME QU'ON RÈGLE
 * ---------------------------------------------------------------------------
 *
 * Une faute de frappe dans une adresse est la seule panne du site qui ne se
 * signale nulle part. Le serveur de courriel accepte le message, Brevo le
 * remet — ou ne le remet pas — à une boîte qui n'existe pas, et rien ne
 * revient. Le joueur, lui, ne reçoit ni le rappel du vendredi, ni le bilan du
 * lundi, ni le lien de mot de passe oublié le jour où il en aura besoin. Il
 * finit par ne plus jouer, et personne ne saura jamais pourquoi.
 *
 * Le remède est un lien envoyé à l'inscription. S'il est suivi, l'adresse
 * existe et quelqu'un la relève : c'est tout ce qu'on cherche à savoir.
 *
 * ---------------------------------------------------------------------------
 * CE QU'ON NE FAIT PAS
 * ---------------------------------------------------------------------------
 *
 * On ne bloque pas le compte. C'est la décision structurante, et elle va contre
 * l'habitude. Un site qui s'ouvre au public verrouille, parce qu'une adresse non
 * vérifiée y est le signe d'un robot. Ici il y a huit joueurs qui se connaissent
 * : une adresse non vérifiée est le signe d'une faute de frappe ou d'un courriel
 * tombé dans les indésirables, et fermer la porte au nez de quelqu'un pour ça
 * serait absurde.
 *
 * Le bandeau dans l'application fait tout le travail, et il le fait mieux :
 * c'est le seul endroit où une adresse fautive peut être corrigée, puisque par
 * définition le courriel n'y arrive pas.
 *
 * ---------------------------------------------------------------------------
 * LE JETON
 * ---------------------------------------------------------------------------
 *
 * Même mécanique que la réinitialisation de mot de passe, et pour les mêmes
 * raisons : trente-deux octets tirés au hasard, dont on ne stocke que
 * l'empreinte SHA-256. Une fuite de la base ne permet donc pas de confirmer
 * l'adresse de quelqu'un d'autre, puisque le lien envoyé reste introuvable à
 * partir de ce qui est gardé.
 *
 * Quatorze jours de validité, là où un lien de mot de passe en vaut une heure.
 * Les deux urgences n'ont rien à voir : un mot de passe oublié se traite dans
 * la minute, une adresse se confirme quand on relève sa boîte — et un lien
 * expiré donnerait précisément l'impression de panne qu'on cherche à éviter.
 * De toute façon, un nouveau lien s'obtient d'un clic depuis le bandeau.
 *
 * Demander un nouveau lien périme les précédents : sinon, corriger son adresse
 * laisserait vivant un lien envoyé à l'ancienne, c'est-à-dire à la mauvaise.
 */

const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const mailer = require('./mailer.service');

const prisma = new PrismaClient();

const KIND = 'EMAIL_VERIFY';
const DUREE_JOURS = 14;

const empreinte = (jeton) => crypto.createHash('sha256').update(jeton).digest('hex');

const racine = () => (process.env.APP_URL || '').replace(/\/$/, '');

/**
 * Crée un jeton et périme ceux qui traînaient.
 *
 * `updateMany` plutôt qu'une suppression : on garde la trace, et un jeton
 * marqué utilisé répond « ce lien a été remplacé » au lieu de « ce lien
 * n'existe pas », ce qui n'est pas le même message pour celui qui clique.
 */
async function creerJeton(userId) {
  await prisma.authToken.updateMany({
    where: { userId, kind: KIND, usedAt: null },
    data: { usedAt: new Date() },
  });

  const jeton = crypto.randomBytes(32).toString('hex');
  await prisma.authToken.create({
    data: {
      userId,
      kind: KIND,
      tokenHash: empreinte(jeton),
      expiresAt: new Date(Date.now() + DUREE_JOURS * 24 * 3600 * 1000),
    },
  });

  return jeton;
}

/**
 * Envoie le lien.
 *
 * Ne lève jamais : l'appelant est l'inscription, et une inscription ne doit pas
 * échouer parce qu'un serveur de courriel est indisponible. Le joueur a son
 * compte, il verra le bandeau, il redemandera un lien. Le rapport dit ce qui
 * s'est passé pour que l'appelant puisse le journaliser.
 */
async function envoyer(user) {
  if (!mailer.isConfigured()) {
    return { envoye: false, raison: 'Envoi d e-mails non configure' };
  }

  try {
    const jeton = await creerJeton(user.id);
    const lien = `${racine()}/confirmer?jeton=${jeton}`;

    const html = mailer.wrap(
      'Confirme ton adresse',
      `Salut ${user.username}, bienvenue dans la bande.<br><br>` +
      `Un clic sur le bouton ci-dessous et c'est réglé : ça nous confirme que ` +
      `cette adresse est la bonne, et que les rappels du vendredi arriveront ` +
      `bien jusqu'à toi.<br><br>` +
      `<span style="color:#6b6357;">Ton compte fonctionne déjà, tu peux ` +
      `pronostiquer sans attendre.</span>`,
      'Confirmer mon adresse',
      lien,
      `Ce lien est valable ${DUREE_JOURS} jours. Si tu n'es à l'origine d'aucune ` +
      `inscription, ignore ce message : sans ce clic, rien ne se passe.`
    );

    const text =
      `Salut ${user.username}, bienvenue dans la bande.\n\n` +
      `Confirme ton adresse en ouvrant ce lien :\n${lien}\n\n` +
      `Ton compte fonctionne deja, tu peux pronostiquer sans attendre.\n` +
      `Lien valable ${DUREE_JOURS} jours.`;

    await mailer.send({
      to: user.email,
      subject: 'Confirme ton adresse — Top 14 Pronos',
      html,
      text,
    });

    return { envoye: true };
  } catch (err) {
    return { envoye: false, raison: err.message };
  }
}

/**
 * Confirme une adresse à partir du jeton reçu.
 *
 * Les quatre refus sont distingués, parce qu'ils appellent quatre phrases
 * différentes à l'écran : un lien inconnu n'est pas un lien expiré, et une
 * adresse déjà confirmée n'est pas un échec du tout — c'est le cas de celui qui
 * clique deux fois, et lui dire « lien invalide » serait lui faire croire à une
 * panne.
 */
async function confirmer(jeton) {
  if (!jeton || typeof jeton !== 'string') return { ok: false, raison: 'inconnu' };

  const ligne = await prisma.authToken.findUnique({
    where: { tokenHash: empreinte(jeton) },
    include: { user: true },
  });

  if (!ligne || ligne.kind !== KIND) return { ok: false, raison: 'inconnu' };

  if (ligne.usedAt) {
    // Déjà confirmée : ce n'est pas une erreur, c'est un second clic.
    if (ligne.user.emailVerifie) return { ok: true, deja: true, username: ligne.user.username };
    return { ok: false, raison: 'remplace' };
  }

  if (ligne.expiresAt < new Date()) return { ok: false, raison: 'expire' };

  await prisma.$transaction([
    prisma.authToken.update({ where: { id: ligne.id }, data: { usedAt: new Date() } }),
    prisma.user.update({
      where: { id: ligne.userId },
      data: { emailVerifie: true, emailVerifieAt: new Date() },
    }),
  ]);

  return { ok: true, deja: false, username: ligne.user.username };
}

module.exports = { envoyer, confirmer, creerJeton, KIND, DUREE_JOURS };
