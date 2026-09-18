const cron = require('node-cron');
const { syncResults, shouldSync } = require('../services/results-sync.service');

/**
 * Lance la synchronisation automatique des resultats toutes les 30 minutes.
 * N'interroge l'API que s'il reste des matchs passes sans resultat.
 */
function startResultsCron() {
  cron.schedule(
    '*/30 * * * *',
    async () => {
      try {
        if (!(await shouldSync())) return;   // rien a recuperer, on economise l'appel
        console.log('[cron] synchronisation des resultats...');
        await syncResults();
      } catch (err) {
        console.error('[cron] erreur :', err.message);
      }
    },
    { timezone: 'Europe/Paris' }
  );

  console.log('Cron resultats actif (toutes les 30 min)');
}

module.exports = { startResultsCron };
