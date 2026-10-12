const cron = require('node-cron');
const { syncStats } = require('../services/team-stats.service');
const journal = require('../services/job-log.service');

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
 *
 * ---------------------------------------------------------------------------
 * CE QUI SE JOURNALISE, ET POURQUOI
 * ---------------------------------------------------------------------------
 *
 * Cette tache est celle qui a donne son nom au probleme : trois matchs
 * manquaient depuis la premiere journee, les moyennes de huit clubs sur
 * quatorze etaient fausses, et l'erreur s'est signalee pendant cinq semaines
 * dans une console que personne ne lit. Les journaux de Railway disparaissent
 * au redemarrage du conteneur ; une ligne en base, non.
 *
 * `journal.passe` enregistre donc chaque passage. Une passe qui n'avait rien a
 * lire compte comme une reussite : c'est ce qui permet de distinguer une tache
 * muette parce qu'il n'y a rien a faire d'une tache muette parce qu'elle ne
 * tourne plus — la seule question que la surveillance ait a trancher.
 *
 * Et `r.ok` a faux leve : le service avait signale l'erreur a la console et
 * rendu la main comme si de rien n'etait, donc l'echec restait invisible. En
 * levant, il devient une ligne d'echec en base, et l'alerte du matin le dira.
 */
const HORAIRE = process.env.STATS_CRON || '43 7,23 * * *';

function startStatsCron() {
  if (process.env.STATS === 'off') {
    console.log('Lecture des statistiques desactivee (STATS=off)');
    return;
  }

  cron.schedule(
    HORAIRE,
    () =>
      journal.passe(journal.TACHES.STATISTIQUES, async () => {
        const r = await syncStats();
        if (r.reason) return { rien: r.reason };   // le cas courant, inutile de bavarder
        for (const c of r.changes) console.log(`[stats] ${c}`);
        if (!r.ok) throw new Error('la passe s\'est terminee en erreur — voir les journaux');
        return { changements: r.changes.length };
      }),
    { timezone: 'Europe/Paris' }
  );

  console.log(`Lecture des statistiques active : ${HORAIRE} (Europe/Paris)`);
}

module.exports = { startStatsCron };
