/**
 * Les nouveautes, et les deux facons de les annoncer.
 *
 * Il y en avait une seule, un courriel a part envoye a la main. Elle reste —
 * c'est `envoyerAnnonce` plus bas — et la voici doublee d'un bloc glisse dans le
 * rappel du vendredi.
 *
 * Pourquoi les deux plutot qu'un seul : ils ne touchent pas les memes gens. Le
 * rappel du vendredi ne part qu'aux joueurs a qui il manque des pronostics,
 * c'est tout son objet ; ceux qui ont deja tout pose ne le recoivent jamais. Le
 * courriel d'annonce, lui, part a tout le monde, mais c'est un courriel de plus
 * dans une boite. Selon ce qu'on annonce, l'un ou l'autre convient — et ce
 * fichier porte le texte une seule fois pour les deux.
 *
 * ---------------------------------------------------------------------------
 * LE BLOC DU VENDREDI S'ETEINT A LA MAIN
 * ---------------------------------------------------------------------------
 *
 * `ANNONCE_VENDREDI` a faux, et il disparait. C'est la seule chose a faire une
 * fois l'annonce passee, et il faut y penser : le rappel du vendredi repart
 * chaque semaine, donc un bloc laisse allume serait relu tous les vendredis
 * jusqu'a ce que plus personne ne lise rien.
 *
 * On aurait pu l'eteindre tout seul — retenir qui a vu quoi, dater l'annonce,
 * comparer. Ca demande une colonne, une notion de version et un mecanisme
 * entier, pour une chose qu'on fait trois fois par saison. Un booleen qu'on
 * bascule a la main est plus honnete : il ne pretend pas savoir ce qu'il ne sait
 * pas.
 */

const { PrismaClient } = require('@prisma/client');
const mailer = require('./mailer.service');
const desinscription = require('./desinscription.service');

const prisma = new PrismaClient();

/**
 * Le bloc de nouveautes apparait-il dans le rappel du vendredi ?
 *
 * A `false`, et c'est le bon reglage pour cette annonce-ci : le rappel du
 * vendredi ne part qu'aux joueurs a qui il manque des pronostics, donc ceux qui
 * ont deja tout pose n'auraient rien su. Cette annonce-la part par courriel a
 * part, `envoyerAnnonce` plus bas, qui ecrit a tout le monde.
 *
 * Le mecanisme reste en place pour la prochaine fois. Il vaut quand ce qu'on
 * annonce s'adresse surtout aux retardataires — un changement dans la facon de
 * poser ses pronos, par exemple — et il evite alors un courriel de plus.
 *
 * S'il repasse a `true`, penser a le remettre a `false` une fois l'annonce
 * faite : le rappel repart chaque semaine, et un bloc laisse allume serait relu
 * tous les vendredis jusqu'a ce que plus personne ne lise rien.
 */
const ANNONCE_VENDREDI = false;

/**
 * Ce qu'on annonce, du plus utile au moins.
 *
 * Cinq entrees, et pas une de plus : au-dela, une annonce se parcourt au lieu de
 * se lire. Rien sur les sauvegardes, le journal des taches ni la table de
 * classement — ce sont des choses qui interessent celui qui maintient, pas celui
 * qui joue.
 *
 * L'ordre n'est pas chronologique mais utile : d'abord ce qui change la facon de
 * jouer, ensuite ce qui corrige une erreur, enfin ce qui rend le site plus
 * agreable. Quelqu'un qui s'arrete apres deux entrees aura lu les deux qui
 * comptent.
 */
const NOUVEAUTES = [
  {
    titre: 'Bob le poulpe',
    texte:
      'Un nouveau bouton qui remplit tes cases vides à partir des stats des ' +
      'clubs, pour les journées où tu es en retard ou sans avis. Il peut aussi ' +
      'commenter tes pronos — il n\'est pas tendre !',
  },
  {
    titre: 'Les statistiques des clubs étaient fausses',
    texte:
      'Trois matchs manquaient depuis la première journée, ce qui faussait les ' +
      'moyennes de huit clubs sur quatorze. C\'est corrigé : si certains chiffres ' +
      'te paraissaient bizarres, tu avais raison.',
  },
  {
    titre: 'Le joker se pose sur le match',
    texte:
      'Tu le coches directement sur la rencontre de ton choix, et il reste ' +
      'déplaçable jusqu\'au coup d\'envoi de ce match-là. Sur « Tous les pronos », ' +
      'on voit maintenant où chacun a posé le sien.',
  },
  {
    titre: 'Les noms de clubs ne sont plus coupés',
    texte:
      'Fini les « Montp / ellier » et les colonnes qui débordent : les noms ' +
      's\'affichent en entier sur toutes les pages, y compris sur téléphone.',
  },
  {
    titre: 'Le site s\'installe sur ton téléphone',
    texte:
      'Depuis le menu de ton navigateur, « Ajouter à l\'écran d\'accueil » : il ' +
      's\'ouvre comme une application, sans barre d\'adresse.',
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
 * Le bloc du vendredi, en HTML.
 *
 * Il arrive apres la liste des matchs manquants, et il est separe d'elle par un
 * filet : le rappel a un travail — dire d'aller jouer — et ce bloc n'en fait
 * pas partie. Sans separation visible, cinq paragraphes de nouveautes
 * donneraient l'impression que le message parle d'autre chose, et la liste des
 * matchs se perdrait au milieu.
 *
 * Styles ecrits sur chaque balise, et filet en `<table>` plutot qu'en `<hr>` :
 * ce sont les contraintes du courriel, expliquees en tete de `mailer.service`.
 * Les couleurs sont celles du gabarit, recopiees ici parce qu'un courriel n'a
 * pas de variables.
 *
 * Rend une chaine vide quand il n'y a rien a dire — l'appelant n'a donc aucun
 * test a faire de son cote.
 */
function vendrediHtml() {
  if (!ANNONCE_VENDREDI || !NOUVEAUTES.length) return '';
  return (
    '<br><br>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
    '<tr><td style="border-top:1px solid #e3dcc6;font-size:0;line-height:0;">&nbsp;</td></tr>' +
    '</table>' +
    '<p style="margin:18px 0 12px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;' +
    'color:#b4863b;font-weight:700;">✦ Du neuf sur le site</p>' +
    NOUVEAUTES.map(
      (n) =>
        `<p style="margin:0 0 14px;font-size:14px;line-height:1.6;"><b>${n.titre}</b><br>` +
        `<span style="color:#6b6357;">${n.texte}</span></p>`
    ).join('')
  );
}

/** Le meme bloc pour la version texte du rappel. */
function vendrediTexte() {
  if (!ANNONCE_VENDREDI || !NOUVEAUTES.length) return '';
  return `\n\n--\nDU NEUF SUR LE SITE\n\n${corpsTexte()}`;
}

/**
 * Envoie l'annonce comme courriel a part.
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

module.exports = {
  ANNONCE_VENDREDI,
  NOUVEAUTES,
  vendrediHtml,
  vendrediTexte,
  envoyerAnnonce,
};
