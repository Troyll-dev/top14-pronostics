/**
 * L'alerte : quand une tache automatique ne va pas, elle vient te chercher.
 *
 * ---------------------------------------------------------------------------
 * POURQUOI UN COURRIEL ET PAS UNE PAGE
 * ---------------------------------------------------------------------------
 *
 * Le bug des statistiques s'est signale pendant cinq semaines. Il ecrivait
 * fidelement dans les journaux de la console, et personne ne les lisait — pas
 * par negligence, mais parce qu'on ne va pas lire des journaux quand on ne sait
 * pas qu'il y a quelque chose a y lire. Une page d'administration qui afficherait
 * l'etat des taches souffrirait exactement du meme defaut : elle ne se consulte
 * que lorsqu'on soupconne deja un probleme.
 *
 * Le seul mecanisme qui corrige ca est un envoi. La panne traverse, et elle
 * arrive la ou tu regardes tous les jours.
 *
 * ---------------------------------------------------------------------------
 * LE SILENCE EST LA REGLE
 * ---------------------------------------------------------------------------
 *
 * Rien ne part quand tout va bien. C'est la condition pour que le message garde
 * sa valeur : un rapport quotidien « tout va bien » se classe en deux semaines
 * dans un dossier qu'on n'ouvre plus, et le jour ou il dit autre chose, il est
 * range avec les autres sans etre lu.
 *
 * Le revers assume : un serveur completement arrete n'envoie rien non plus,
 * puisque c'est lui qui envoie. Cette alerte attrape les taches en panne, pas
 * l'hebergeur en panne — Railway a ses propres alertes pour ca, et un site
 * injoignable se remarque de toute facon en une heure.
 *
 * ---------------------------------------------------------------------------
 * A QUI
 * ---------------------------------------------------------------------------
 *
 * A toi seul, jamais aux joueurs. On avait envisage une ligne dans le bilan du
 * lundi : c'est une mauvaise idee, parce que ce bilan part a tout le monde et
 * qu'une panne de synchronisation n'interesse que celui qui peut la reparer.
 *
 * `BACKUP_EMAIL_TO` sert d'adresse par defaut : c'est deja l'adresse technique
 * du projet, celle qui recoit les sauvegardes, et elle est prouvee chaque lundi.
 * `SANTE_EMAIL_TO` permet d'en mettre une autre sans toucher au code.
 */

const mailer = require('./mailer.service');
const journal = require('./job-log.service');

const LIBELLES = {
  sauvegarde: 'Sauvegarde de la base',
  resultats: 'Scores en direct',
  classement: 'Classement du championnat',
  compositions: 'Compositions d\'equipe',
  statistiques: 'Statistiques des clubs',
  horaires: 'Horaires et diffuseurs',
  bilan: 'Bilan du lundi',
};

const destinataire = () => process.env.SANTE_EMAIL_TO || process.env.BACKUP_EMAIL_TO || '';

const nom = (job) => LIBELLES[job] || job;

/** Une anomalie en une phrase, lisible sans connaitre le code. */
function phrase(a) {
  if (a.type === 'echec') {
    const quand = new Date(a.quand).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
    return `${nom(a.job)} : echoue depuis le ${quand} — ${a.message || 'sans message'}`;
  }
  if (a.jamais) {
    return `${nom(a.job)} : n'a jamais rien enregistre (le cron est-il demarre dans app.js ?)`;
  }
  return `${nom(a.job)} : aucune reussite depuis ${a.jours} jours (seuil : ${a.seuil})`;
}

/**
 * Regarde, et ecrit s'il le faut.
 *
 * `dryRun` ne touche a rien et rend ce qui serait envoye : c'est ce qui permet
 * de verifier le dispositif un mardi, sans attendre une vraie panne.
 */
async function verifier({ dryRun = false, now = new Date() } = {}) {
  const liste = await journal.anomalies(now);
  const rapport = { anomalies: liste, envoye: false };

  if (!liste.length) return rapport;

  const to = destinataire();
  if (!to) {
    rapport.raison = 'Aucune adresse (SANTE_EMAIL_TO ni BACKUP_EMAIL_TO)';
    return rapport;
  }
  if (!mailer.isConfigured()) {
    rapport.raison = 'Envoi d e-mails non configure';
    return rapport;
  }

  const lignes = liste.map(phrase);
  rapport.texte = lignes.join('\n');

  if (dryRun) return rapport;

  const n = liste.length;
  const text =
    `${n} tache${n > 1 ? 's' : ''} automatique${n > 1 ? 's' : ''} ne va pas :\n\n` +
    lignes.map((l) => `- ${l}`).join('\n') +
    `\n\nCe message ne part que lorsqu'il y a quelque chose a dire.`;

  const html =
    `<p style="margin:0 0 14px;font-size:15px;">` +
    `<b>${n} tache${n > 1 ? 's' : ''} automatique${n > 1 ? 's' : ''} ne va pas.</b></p>` +
    lignes
      .map((l) => `<p style="margin:0 0 10px;font-size:14px;line-height:1.6;">• ${l}</p>`)
      .join('') +
    `<p style="margin:18px 0 0;font-size:12px;color:#6b6357;">` +
    `Ce message ne part que lorsqu'il y a quelque chose a dire : pas de nouvelle, bonne nouvelle.</p>`;

  await mailer.send({
    to,
    subject: `[Top 14] ${n} tache${n > 1 ? 's' : ''} en panne`,
    text,
    html,
  });

  rapport.envoye = true;
  return rapport;
}

module.exports = { verifier, phrase, LIBELLES };
