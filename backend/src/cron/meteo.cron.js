const cron = require('node-cron');
const { syncMeteo } = require('../services/meteo.service');
const journal = require('../services/job-log.service');

/**
 * Deux lectures par jour, heure de Paris.
 *
 * Pourquoi deux et pas une : une prevision se corrige, et celle qui compte est
 * la derniere avant le coup d'envoi. Le passage du matin sert les journees qui
 * approchent, celui de 18 h rattrape les corrections de la journee avant la
 * soiree ou l'on pronostique — c'est le meme raisonnement que pour les
 * compositions, et les memes heures auraient aussi bien fait l'affaire.
 *
 * Pourquoi pas davantage : au-dela, on raffine une prevision que personne ne
 * relit. Sept rencontres par journee et deux passages quotidiens font une
 * quinzaine d'appels par jour, sur les dix mille qu'Open-Meteo accorde — on
 * reste trois ordres de grandeur sous la limite, et c'est tres bien ainsi.
 *
 * Hors saison, la tache ne trouve aucune rencontre dans sa fenetre et le dit au
 * journal plutot que de ne rien ecrire : c'est ce qui permet de distinguer
 * « rien a faire » de « ne tourne plus », distinction qui avait manque au bug
 * des statistiques pendant cinq semaines.
 */
const HORAIRE = process.env.METEO_CRON || '42 7,18 * * *';

function startMeteoCron() {
  if (process.env.METEO === 'off') {
    console.log('Releve meteo desactive (METEO=off)');
    return;
  }

  cron.schedule(
    HORAIRE,
    () =>
      journal.passe(journal.TACHES.METEO, async () => {
        const r = await syncMeteo();
        if (r.reason) return { rien: r.reason };
        return { releves: r.releves, ignores: r.ignores, erreurs: r.erreurs };
      }),
    { timezone: 'Europe/Paris' }
  );

  console.log(`Releve meteo actif : ${HORAIRE} (Europe/Paris)`);
}

module.exports = { startMeteoCron };
