const cron = require('node-cron');
const { syncCompositions } = require('../services/composition-sync.service');
const journal = require('../services/job-log.service');

/**
 * Quatre lectures par jour, heure de Paris.
 *
 * Pourquoi pas une seule, comme les horaires. Les horaires sont arretes une a
 * deux semaines avant ; les compositions paraissent le jeudi ou le vendredi et
 * sont corrigees jusqu'au coup d'envoi. Une lecture quotidienne a 6 h 20
 * signifierait qu'une equipe annoncee le vendredi a 18 h n'apparait sur le site
 * que le samedi matin — c'est-a-dire apres la soiree ou l'on pronostique.
 *
 * Les quatre creneaux suivent donc la semaine telle qu'elle se joue : midi et
 * 18 h pour les annonces de jeudi et vendredi, 8 h 15 pour les corrections de
 * la nuit avant les matchs de l'apres-midi, 22 h pour celles d'avant le
 * dimanche soir.
 *
 * C'est peu couteux — sept requetes par journee proche, et rien du tout hors
 * saison, le service ne trouvant alors aucune rencontre dans sa fenetre.
 *
 * Aucun risque d'abimer un resultat : ce service n'ecrit que `composition` et
 * `compositionAt`, jamais sur une rencontre terminee.
 *
 * Chaque passage s'enregistre dans le journal, y compris quand il n'y a rien a
 * lire : hors saison cette tache est muette pendant des mois, et sans cette
 * trace on ne saurait pas distinguer « rien a faire » de « ne tourne plus ».
 */
const HORAIRE = process.env.COMPOSITIONS_CRON || '17 8,12,18,22 * * *';

function startCompositionCron() {
  if (process.env.COMPOSITIONS === 'off') {
    console.log('Lecture des compositions desactivee (COMPOSITIONS=off)');
    return;
  }

  cron.schedule(
    HORAIRE,
    () =>
      journal.passe(journal.TACHES.COMPOSITIONS, async () => {
        const r = await syncCompositions();
        if (r.reason) return { rien: r.reason };
        for (const c of r.changes) console.log(`[compositions] ${c}`);
        if (!r.ok) throw new Error('la passe s\'est terminee en erreur — voir les journaux');
        return { changements: r.changes.length };
      }),
    { timezone: 'Europe/Paris' }
  );

  console.log(`Lecture des compositions active : ${HORAIRE} (Europe/Paris)`);
}

module.exports = { startCompositionCron };
