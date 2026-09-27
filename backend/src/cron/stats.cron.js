const cron = require('node-cron');
const { syncStats } = require('../services/team-stats.service');

/**
 * Deux passes par jour, heure de Paris.
 *
 * Pourquoi pas au coup de sifflet final. Parce qu'un declencheur branche sur
 * « le match vient de finir » ne se remet jamais de son propre echec : la LNR
 * publie ses statistiques avec une heure ou deux de retard, et un declencheur
 * qui a manque sa fenetre ne repasse pas. C'est exactement ce qui avait laisse
 * le classement du championnat fige quatre jours.
 *
 * Cette passe compare donc un **etat** : quelles rencontres terminees n'ont pas
 * encore leurs statistiques ? La reponse se vide d'elle-meme, se remplit
 * d'elle-meme, et rattrape une journee entiere sans qu'on demande rien.
 *
 * 23 h 43 pour que la journee du week-end soit complete avant le bilan du lundi
 * matin, et 7 h 43 pour rattraper ce que la LNR aurait publie pendant la nuit.
 *
 * Une page de match joue ne changeant plus, chaque rencontre n'est lue qu'une
 * fois dans toute la saison : hors week-end cette passe ne fait rien du tout.
 */
const HORAIRE = process.env.STATS_CRON || '43 7,23 * * *';

function startStatsCron() {
  if (process.env.STATS === 'off') {
    console.log('Lecture des statistiques desactivee (STATS=off)');
    return;
  }

  cron.schedule(
    HORAIRE,
    async () => {
      try {
        const r = await syncStats();
        if (r.reason) return;   // rien a lire : le cas courant, inutile de bavarder
        for (const c of r.changes) console.log(`[stats] ${c}`);
        if (!r.ok) console.error('[stats] la passe s\'est terminee en erreur — voir au-dessus');
      } catch (err) {
        console.error('[stats] ECHEC :', err.message);
      }
    },
    { timezone: 'Europe/Paris' }
  );

  console.log(`Lecture des statistiques active : ${HORAIRE} (Europe/Paris)`);
}

module.exports = { startStatsCron };
