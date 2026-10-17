const cron = require('node-cron');
const { syncSixNations, tournoiEnCours } = require('../services/six-nations-sync.service');
const journal = require('../services/job-log.service');

/**
 * Le Tournoi des Six Nations : toutes les heures pendant la compétition, une
 * fois par jour le reste de l'année.
 *
 * Une seule planification, à la vingt-cinquième minute de chaque heure, et
 * c'est la passe qui décide si elle travaille. Pendant les six semaines du
 * Tournoi, un score tombe le samedi soir et doit être compté dans l'heure. Le
 * reste de l'année, seul un horaire déplacé peut changer, et une lecture à
 * 6 h 25 suffit — vingt-trois requêtes par jour vers un site qu'on lit
 * gratuitement n'apprendraient rien de plus.
 *
 * Avant la toute première lecture, la base ne connaît aucun match du Tournoi :
 * `tournoiEnCours` répond non, et c'est la passe de 6 h 25 qui fera l'import.
 * Le script `six-nations-import.js` permet de ne pas l'attendre.
 *
 * Chaque passage s'inscrit au journal, y compris quand il ne fait rien : c'est
 * ce qui permet de distinguer « hors Tournoi » de « ne tourne plus ».
 */
const HORAIRE = process.env.SIX_NATIONS_CRON || '25 * * * *';
const HEURE_HORS_TOURNOI = 6;

function startSixNationsCron() {
  if (process.env.SIX_NATIONS === 'off') {
    console.log('Tournoi des Six Nations desactive (SIX_NATIONS=off)');
    return;
  }

  cron.schedule(
    HORAIRE,
    () =>
      journal.passe(journal.TACHES.TOURNOI, async () => {
        const heure = Number(
          new Intl.DateTimeFormat('fr-FR', { hour: 'numeric', hour12: false, timeZone: 'Europe/Paris' })
            .format(new Date())
        );
        if (!(await tournoiEnCours()) && heure !== HEURE_HORS_TOURNOI) {
          return { rien: 'hors Tournoi' };
        }
        const r = await syncSixNations();
        if (!r.ok) throw new Error(`la passe a refusé ${r.refuses.length} rencontre(s) — voir les journaux`);
        return {
          crees: r.crees.length, modifies: r.modifies.length,
          scores: r.scores.length, inchanges: r.inchanges,
        };
      }),
    { timezone: 'Europe/Paris' }
  );

  console.log(`Tournoi des Six Nations actif : ${HORAIRE} (Europe/Paris)`);
}

module.exports = { startSixNationsCron };
