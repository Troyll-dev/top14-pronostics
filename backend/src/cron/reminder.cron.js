const cron = require('node-cron');
const { envoyerRappels } = require('../services/reminder.service');
const journal = require('../services/job-log.service');

/**
 * Vendredi 17 h, heure de Paris.
 *
 * L'heure arrive en fin d'apres-midi, quand on releve ses mails avant de
 * quitter le travail, et a pres de vingt-deux heures du premier coup d'envoi
 * du samedi : il reste tout le week-end devant soi pour poser ses pronos, donc
 * le rappel garde l'allure d'une invitation et non d'une sommation.
 *
 * Pour la changer, une seule ligne — et la syntaxe est « minute heure ».
 *
 * ---------------------------------------------------------------------------
 * CELLE-CI MERITE SA PLACE DANS LE JOURNAL PLUS QUE TOUTE AUTRE
 * ---------------------------------------------------------------------------
 *
 * C'est la tache dont l'appel a ete oublie dans `app.js`. Pendant ce temps-la
 * elle n'a rien envoye, rien signale, et rien n'a permis de s'en apercevoir :
 * un vendredi sans rappel ressemble exactement a un vendredi sans journee a
 * venir. C'est de cette panne-la qu'est nee l'idee de surveiller les taches, et
 * elle etait la seule des sept a ne pas y figurer encore.
 *
 * Elle enregistre donc son passage meme quand elle n'ecrit a personne — treve,
 * ou tout le monde a deja pronostique. Son seuil est a neuf jours : un vendredi
 * manque devient visible des le samedi suivant.
 *
 * Les echecs d'envoi individuels ne font pas echouer la passe. Un joueur dont
 * l'adresse rebondit ne doit pas faire declarer en panne un rappel parti aux
 * sept autres — et c'est desormais le bandeau de verification d'adresse qui
 * traite ce cas-la, a sa racine. Ces erreurs restent dans le detail de la
 * ligne, consultable depuis la page d'administration.
 */
function startReminderCron() {
  if (process.env.REMINDERS === 'off') {
    console.log('Rappels desactives (REMINDERS=off)');
    return;
  }

  cron.schedule(
    '0 17 * * 5',
    () =>
      journal.passe(journal.TACHES.RAPPELS, async () => {
        const r = await envoyerRappels();
        if (r.raison) {
          console.log(`[rappels] ${r.raison}`);
          return { rien: r.raison };
        }
        console.log(
          `[rappels] J${r.round} : ${r.envoyes.length} envoye(s)` +
          (r.ignores.length ? `, ${r.ignores.length} ignore(s)` : '') +
          (r.erreurs.length ? `, ${r.erreurs.length} erreur(s)` : '')
        );
        for (const e of r.erreurs) console.error(`[rappels] ${e}`);
        return {
          journee: r.round,
          envoyes: r.envoyes.length,
          ignores: r.ignores.length,
          erreurs: r.erreurs,
        };
      }),
    { timezone: 'Europe/Paris' }
  );

  console.log('Rappels actifs : vendredi 17 h');
}

module.exports = { startReminderCron };
