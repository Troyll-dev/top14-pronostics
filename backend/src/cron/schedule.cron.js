const cron = require('node-cron');
const { syncSchedule } = require('../services/schedule-sync.service');
const journal = require('../services/job-log.service');

/**
 * Tous les jours a 6 h 20, heure de Paris.
 *
 * Quotidien parce que la LNR arrete ses horaires au fil des semaines et peut
 * decaler une rencontre a quelques jours du coup d'envoi ; une lecture
 * hebdomadaire laisserait donc afficher un horaire perime pendant six jours,
 * et c'est l'horaire qui ferme la saisie des pronostics.
 *
 * Au petit matin parce que la passe ne sert a rien pendant les matchs et que
 * personne ne consulte le site a cette heure-la : si elle corrige un horaire,
 * la correction est en place avant la premiere visite de la journee.
 *
 * La minute n'est pas ronde a dessein : les taches programmees a l'heure pile
 * se bousculent, et celle-ci n'a aucune raison d'attendre son tour.
 *
 * C'est la tache dont le silence est le plus dangereux : un horaire perime
 * ferme la saisie des pronostics au mauvais moment, et rien a l'ecran ne dit
 * que l'horaire affiche date d'il y a trois semaines. Elle passe une fois par
 * jour, le seuil d'alerte est donc a deux jours.
 */
function startScheduleCron() {
  if (process.env.HORAIRES === 'off') {
    console.log('Horaires desactives (HORAIRES=off)');
    return;
  }

  cron.schedule(
    '20 6 * * *',
    () =>
      journal.passe(journal.TACHES.HORAIRES, async () => {
        const r = await syncSchedule();
        if (r.reason) return { rien: r.reason };
        for (const c of r.changes) console.log(`[horaires] ${c}`);
        return { changements: r.changes.length };
      }),
    { timezone: 'Europe/Paris' }
  );

  console.log('Horaires actifs : tous les jours a 6 h 20');
}

module.exports = { startScheduleCron };
