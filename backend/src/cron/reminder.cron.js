const cron = require('node-cron');
const { envoyerRappels } = require('../services/reminder.service');

/**
 * Vendredi 17 h, heure de Paris.
 *
 * L'heure arrive en fin d'apres-midi, quand on releve ses mails avant de
 * quitter le travail, et a pres de vingt-deux heures du premier coup d'envoi
 * du samedi : il reste tout le week-end devant soi pour poser ses pronos, donc
 * le rappel garde l'allure d'une invitation et non d'une sommation.
 *
 * Pour la changer, une seule ligne — et la syntaxe est « minute heure ».
 */
function startReminderCron() {
  if (process.env.REMINDERS === 'off') {
    console.log('Rappels desactives (REMINDERS=off)');
    return;
  }

  cron.schedule(
    '0 17 * * 5',
    async () => {
      try {
        const r = await envoyerRappels();
        if (r.raison) return console.log(`[rappels] ${r.raison}`);
        console.log(
          `[rappels] J${r.round} : ${r.envoyes.length} envoye(s)` +
          (r.ignores.length ? `, ${r.ignores.length} ignore(s)` : '') +
          (r.erreurs.length ? `, ${r.erreurs.length} erreur(s)` : '')
        );
        for (const e of r.erreurs) console.error(`[rappels] ${e}`);
      } catch (err) {
        console.error('[rappels] ECHEC :', err.message);
      }
    },
    { timezone: 'Europe/Paris' }
  );

  console.log('Rappels actifs : vendredi 17 h');
}

module.exports = { startReminderCron };
