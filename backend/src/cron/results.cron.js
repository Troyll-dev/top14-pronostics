const cron = require('node-cron');
const { syncResults, shouldSync } = require('../services/results-sync.service');

/**
 * Synchronisation automatique des resultats.
 *
 * Toutes les dix minutes plutot que toutes les trente : pendant un match le
 * score bouge, et shouldSync() empeche de toute facon d'appeler l'API quand il
 * n'y a rien a relever. En dehors des week-ends de championnat, ce cron ne fait
 * donc qu'une requete en base et s'arrete la.
 */
function startResultsCron() {
  cron.schedule(
    '*/10 * * * *',
    async () => {
      try {
        if (!(await shouldSync())) return;
        console.log('[cron] synchronisation des resultats...');
        await syncResults();
      } catch (err) {
        console.error('[cron] erreur :', err.message);
      }
    },
    { timezone: 'Europe/Paris' }
  );

  console.log('Cron resultats actif (toutes les 10 min)');
}

module.exports = { startResultsCron };
