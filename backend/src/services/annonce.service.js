/**
 * Le « Quoi de neuf », envoye une fois.
 *
 * Pourquoi un courriel a part plutot qu'une rubrique dans le rappel du vendredi
 * ou dans le bilan du lundi : ces deux-la partent chaque semaine. Une nouveaute
 * qu'ils porteraient serait relue tous les vendredis jusqu'a ce que plus
 * personne ne lise rien — ou bien il faudrait retenir qui a deja vu quoi, donc
 * une colonne, une notion de version et un mecanisme entier pour une annonce
 * qu'on fait une seule fois.
 *
 * Une annonce ponctuelle merite un envoi ponctuel. Celui-ci se declenche a la
 * main, le jour choisi, et ne revient jamais.
 *
 * Ce qui reste dans le rappel du vendredi, c'est `NOUVEAUTE_VENDREDI` : une
 * ligne, une seule nouveaute a la fois, changee a la main quand il y a quelque
 * chose a dire et videe le reste du temps. Pas de base, pas de version, pas de
 * suivi — un texte, ou rien.
 */

const { PrismaClient } = require('@prisma/client');
const mailer = require('./mailer.service');
const desinscription = require('./desinscription.service');

const prisma = new PrismaClient();

/**
 * La ligne du rappel du vendredi. Vide = rien ne s'affiche.
 *
 * Une seule nouveaute a la fois, et courte : elle se glisse dans un message qui
 * a deja un travail a faire, et qui ne doit pas devenir un bulletin.
 */
const NOUVEAUTE_VENDREDI =
  '';

/**
 * Ce qu'on annonce, du plus utile au moins.
 *
 * Cinq entrees, et pas une de plus : au-dela, un courriel d'annonce se parcourt
 * au lieu de se lire. Rien sur les sauvegardes, le journal des taches ni la
 * table de classement — ce sont des choses qui interessent celui qui maintient,
 * pas celui qui joue.
 */
const NOUVEAUTES = [
  {
    titre: 'Les compositions, avant le coup d\'envoi',
    texte:
      'Dès que la LNR les publie, les quinze de départ et les remplaçants ' +
      's\'affichent sous chaque match. De quoi pronostiquer en sachant qui joue.',
  },
  {
    titre: 'La forme des deux clubs',
    texte:
      'Sous chaque affiche, six chiffres qui se répondent : essais marqués et ' +
      'encaissés, possession, pénalités concédées. Cumulés depuis le début de la ' +
      'saison, arrêtés à la journée précédente.',
  },
  {
    titre: 'Le classement officiel de la LNR',
    texte:
      'Le championnat n\'est plus recalculé dans notre coin : c\'est le tableau ' +
      'de la Ligue, avec ses colonnes, son état de forme et le prochain match de ' +
      'chaque club.',
  },
  {
    titre: 'Tes séries et l\'écart avec le voisin',
    texte:
      'Sur l\'accueil et au classement : combien de bons pronostics tu enchaînes, ' +
      'et combien de points te séparent de celui qui te précède. Le classement dit ' +
      'qui gagne, ça dit ce qui se passe.',
  },
  {
    titre: 'Tu choisis ce que tu reçois',
    texte:
      'Deux cases dans ton profil — le rappel du vendredi, le bilan du lundi — et ' +
      'un lien au bas de chaque message pour tout couper sans même te connecter. ' +
      'Et si tu veux faire une pause dans la saison, ça se dit aussi, sans rien perdre.',
  },
];

/** La liste en HTML. Un titre en gras, une phrase, et de l'air entre les deux. */
function corpsHtml() {
  return NOUVEAUTES.map(
    (n) =>
      `<p style="margin:0 0 16px;"><b>${n.titre}</b><br>` +
      `<span style="color:#6b6357;">${n.texte}</span></p>`
  ).join('');
}

function corpsTexte() {
  return NOUVEAUTES.map((n) => `— ${n.titre}\n  ${n.texte.replace(/\s+/g, ' ')}`).join('\n\n');
}

/**
 * Envoie l'annonce.
 *
 * `dryRun` n'ecrit rien et n'envoie rien : il rend la liste des destinataires et
 * le texte du message. A faire tourner d'abord, toujours — une annonce partie
 * ne se rattrape pas, contrairement a un rappel qui repassera la semaine
 * suivante.
 *
 * Qui la recoit : tout le monde, sauf les joueurs en pause et ceux qui ont coupe
 * les deux courriels. Ces derniers ont dit clairement qu'ils ne voulaient plus
 * rien recevoir, et une annonce reste un courriel — se glisser dans la breche
 * en pretextant qu'elle est exceptionnelle est exactement ce que font les
 * expediteurs qu'on finit par bloquer.
 */
async function envoyerAnnonce({ dryRun = true, seulement = null } = {}) {
  const rapport = { destinataires: [], ignores: [], erreurs: [], dryRun };

  if (!mailer.isConfigured()) {
    rapport.erreurs.push('Envoi d e-mails non configure');
    return rapport;
  }

  const users = await prisma.user.findMany({
    where: { enPause: false },
    orderBy: { id: 'asc' },
  });

  const lien = (process.env.APP_URL || '').replace(/\/$/, '');

  for (const u of users) {
    if (!u.mailRappels && !u.mailBilan) {
      rapport.ignores.push(`${u.username} : a coupé tous les courriels`);
      continue;
    }
    if (seulement && u.email.toLowerCase() !== String(seulement).toLowerCase()) {
      rapport.ignores.push(`${u.username} : hors du filtre`);
      continue;
    }

    // Seul le lien de pause est propose : couper « ce type d'envoi » n'aurait
    // aucun sens pour un message qui ne repartira pas.
    const liens = desinscription.disponible()
      ? [{ libelle: 'Ne plus jouer cette saison', url: desinscription.lien(u.id, 'pause') }]
      : [];

    const html = mailer.wrap(
      'Quoi de neuf sur le site',
      `Salut ${u.username}, le site a pas mal bougé ces derniers jours. ` +
      `Voilà ce qui change pour toi.<br><br>${corpsHtml()}`,
      'Aller voir',
      lien,
      'Message unique : celui-ci ne reviendra pas la semaine prochaine.',
      liens
    );

    const text =
      `Salut ${u.username}, voila ce qui change sur le site.\n\n` +
      `${corpsTexte()}\n\n${lien}\n` +
      mailer.piedLiensTexte(liens);

    if (dryRun) {
      rapport.destinataires.push(`${u.username} (simulation)`);
      rapport.apercu = rapport.apercu || text;
      continue;
    }

    try {
      await mailer.send({ to: u.email, subject: 'Quoi de neuf sur le site des pronos', html, text });
      rapport.destinataires.push(u.username);
    } catch (err) {
      rapport.erreurs.push(`${u.username} : ${err.message}`);
    }
  }

  return rapport;
}

module.exports = { NOUVEAUTE_VENDREDI, NOUVEAUTES, envoyerAnnonce };
