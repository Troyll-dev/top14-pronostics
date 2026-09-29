/**
 * Les liens de desinscription, et ce qu'ils declenchent.
 *
 * Un ami qui ne veut plus jouer ne se connectera pas pour aller decocher une
 * case : c'est precisement parce qu'il ne revient plus qu'il veut ne plus
 * recevoir les courriels. Le reglage doit donc etre accessible depuis le
 * courriel lui-meme, sans mot de passe et sans compte a retrouver.
 *
 * Trois actions, de la plus douce a la plus large :
 *
 *   rappels  — plus de rappel du vendredi. Le bilan du lundi continue.
 *   bilan    — plus de bilan du lundi. Le rappel du vendredi continue.
 *   pause    — plus aucun courriel, et le joueur sort du jeu et du classement.
 *
 * Aucune des trois n'efface quoi que ce soit : ni le compte, ni les pronostics,
 * ni les points marques. Tout est reversible, depuis la page de confirmation
 * dans la minute, ou depuis le profil plus tard.
 *
 * ---------------------------------------------------------------------------
 * Comment le lien sait qui il designe, sans mot de passe
 * ---------------------------------------------------------------------------
 *
 * Il porte l'identifiant du joueur, l'action, et une signature calculee a
 * partir d'un secret que seul le serveur connait. Changer le numero dans
 * l'adresse pour desinscrire quelqu'un d'autre ne marche pas : la signature ne
 * correspond plus.
 *
 * Pas de date d'expiration, et c'est delibere. Un lien de desinscription doit
 * encore fonctionner sur un courriel retrouve au fond d'une boite en mars. Ce
 * qu'il permet — couper des envois, et rien d'autre — ne justifie pas le risque
 * de le voir expirer au moment ou quelqu'un en a besoin.
 *
 * La comparaison des signatures se fait en temps constant. La precaution est
 * theorique a cinq joueurs, mais elle ne coute rien et evite d'avoir a se
 * demander, plus tard, si elle manque.
 */

const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/** Les actions reconnues, et ce qu'elles ecrivent en base. */
const ACTIONS = {
  rappels: {
    libelle: 'Ne plus recevoir les rappels du vendredi',
    confirme: 'Tu ne recevras plus le rappel du vendredi. Le bilan du lundi, lui, continue d\'arriver.',
    couper: { mailRappels: false },
    remettre: { mailRappels: true },
  },
  bilan: {
    libelle: 'Ne plus recevoir le bilan du lundi',
    confirme: 'Tu ne recevras plus le bilan du lundi. Le rappel du vendredi, lui, continue d\'arriver.',
    couper: { mailBilan: false },
    remettre: { mailBilan: true },
  },
  pause: {
    libelle: 'Ne plus jouer cette saison',
    confirme:
      'C\'est fait : plus aucun courriel, et tu n\'apparais plus au classement. ' +
      'Rien n\'est efface — tes pronostics et tes points restent, et tu peux revenir quand tu veux.',
    couper: { enPause: true, pauseAt: () => new Date(), mailRappels: false, mailBilan: false },
    remettre: { enPause: false, pauseAt: () => null, mailRappels: true, mailBilan: true },
  },
};

/**
 * Le secret qui signe les liens.
 *
 * On reutilise celui de l'application plutot que d'en inventer un de plus a
 * gerer. S'il manque, on ne signe rien et on ne met aucun lien dans les
 * courriels : mieux vaut un pied de message sans lien qu'un lien qui ne
 * marchera pas, ou pire, une signature previsible.
 */
function secret() {
  return process.env.UNSUBSCRIBE_SECRET || process.env.JWT_SECRET || '';
}

/**
 * L'adresse publique de l'API.
 *
 * Le lien part dans un courriel : il lui faut une adresse absolue, et le
 * serveur ne peut pas la deviner depuis une tache planifiee, ou il n'y a
 * aucune requete entrante pour la lui apprendre. Elle vient donc de
 * l'environnement.
 *
 * Deux sources, dans cet ordre. `API_URL` d'abord, qui permet de forcer une
 * adresse — un nom de domaine a soi, par exemple. A defaut, le domaine public
 * que l'hebergeur pose lui-meme dans l'environnement : la premiere version ne
 * lisait que `API_URL`, et faute de l'avoir posee les liens ne se
 * construisaient pas du tout, alors que l'adresse etait la, a portee de main.
 *
 * Un reglage qu'on peut deduire ne devrait pas avoir a etre saisi : chaque
 * variable a poser est une occasion de l'oublier, et un oubli qui se traduit
 * par une absence silencieuse est le pire des deux.
 */
function baseApi() {
  const explicite = (process.env.API_URL || '').trim();
  if (explicite) return explicite.replace(/\/$/, '');

  const hebergeur = (process.env.RAILWAY_PUBLIC_DOMAIN || '').trim();
  return hebergeur ? `https://${hebergeur.replace(/\/$/, '')}` : '';
}

/** Peut-on fabriquer des liens ? Sinon, les courriels partent sans. */
function disponible() {
  return Boolean(secret() && baseApi());
}

function signature(userId, action) {
  return crypto
    .createHmac('sha256', secret())
    .update(`${userId}.${action}`)
    .digest('base64url')
    .slice(0, 27);
}

/** Vraie si la signature correspond, sans fuite de temps. */
function verifier(userId, action, fournie) {
  if (!secret() || !ACTIONS[action]) return false;
  const attendue = Buffer.from(signature(userId, action));
  const donnee = Buffer.from(String(fournie || ''));
  if (attendue.length !== donnee.length) return false;
  return crypto.timingSafeEqual(attendue, donnee);
}

/** L'adresse complete a mettre dans un courriel. */
function lien(userId, action) {
  if (!disponible()) return null;
  const s = signature(userId, action);
  return `${baseApi()}/api/desinscription?u=${userId}&a=${action}&s=${s}`;
}

/**
 * Les liens a poser au bas d'un courriel.
 *
 * Deux seulement, et jamais trois : celui qui coupe l'envoi qu'on est en train
 * de lire, et celui qui arrete tout. Proposer aussi de couper l'autre type
 * d'envoi depuis un message qui ne le concerne pas ne ferait qu'embrouiller.
 */
function liensPour(userId, type) {
  if (!disponible()) return [];
  return [
    { libelle: ACTIONS[type].libelle, url: lien(userId, type) },
    { libelle: ACTIONS.pause.libelle, url: lien(userId, 'pause') },
  ];
}

/** Applique l'action, ou la defait si `annuler`. Rend l'utilisateur a jour. */
async function appliquer(userId, action, { annuler = false } = {}) {
  const def = ACTIONS[action];
  if (!def) return null;

  const source = annuler ? def.remettre : def.couper;
  const data = {};
  for (const [champ, valeur] of Object.entries(source)) {
    data[champ] = typeof valeur === 'function' ? valeur() : valeur;
  }

  return prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, username: true, mailRappels: true, mailBilan: true, enPause: true },
  });
}

module.exports = { ACTIONS, disponible, signature, verifier, lien, liensPour, appliquer };
