const cron = require('node-cron');
const { syncResults, shouldSync } = require('../services/results-sync.service');
const { syncStandings } = require('../services/standings.service');

/**
 * Deux taches automatiques :
 *  - les resultats, toutes les 30 minutes, uniquement s'il reste des matchs
 *    passes sans score ;
 *  - le classement Top 14, trois fois par jour, en lecture sur allrugby.
 */
function startResultsCron() {
  cron.schedule(
    '*/30 * * * *',
    async () => {
      try {
        if (!(await shouldSync())) return;
        console.log('[cron] synchronisation des resultats...');
        await syncResults();
        // Un resultat vient de tomber : le classement a bouge
        await syncStandings();
      } catch (err) {
        console.error('[cron] erreur resultats :', err.message);
      }
    },
    { timezone: 'Europe/Paris' }
  );

  // Filet de securite : allrugby met parfois son classement a jour en differe
  cron.schedule(
    '15 8,13,23 * * *',
    async () => {
      try {
        console.log('[cron] lecture du classement Top 14...');
        await syncStandings();
      } catch (err) {
        console.error('[cron] erreur classement :', err.message);
      }
    },
    { timezone: 'Europe/Paris' }
  );

  console.log('Cron actif : resultats toutes les 30 min, classement 3 fois par jour');
}

module.exports = { startResultsCron };
