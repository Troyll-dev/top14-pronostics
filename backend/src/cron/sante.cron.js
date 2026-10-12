const cron = require('node-cron');
const { verifier } = require('../services/sante.service');

/**
 * La surveillance des taches, une fois par jour.
 *
 * 9 h 07, heure de Paris. Apres les taches du matin — les horaires a 6 h 20,
 * les statistiques a 7 h 43, le classement a 8 h 17 — pour qu'une panne de la
 * nuit soit deja visible, et assez tot pour que la journee serve a la reparer.
 * La minute n'est pas ronde pour la meme raison que partout ailleurs : les
 * taches programmees a l'heure pile se bousculent.
 *
 * Une fois par jour et pas davantage. Une surveillance qui se repete toutes les
 * heures envoie sept messages pour une seule panne, et c'est la meilleure facon
 * de rendre une alerte invisible : au troisieme, on cree une regle de
 * classement automatique, et au quatrieme on ne la voit plus.
 *
 * Elle ne se tait jamais d'elle-meme en revanche : tant que la panne dure, le
 * message revient chaque matin. Un rappel quotidien est agacant, et c'est son
 * office — une alerte qu'on peut ignorer sans consequence n'est pas une alerte.
 *
 * `SANTE=off` la coupe, comme les autres taches.
 */
function startSanteCron() {
  if (process.env.SANTE === 'off') {
    console.log('Surveillance des taches desactivee (SANTE=off)');
    return;
  }

  cron.schedule(
    '7 9 * * *',
    async () => {
      try {
        const r = await verifier();
        if (!r.anomalies.length) return;              // le cas normal : on se tait
        if (r.envoye) console.log(`[sante] ${r.anomalies.length} anomalie(s) signalee(s)`);
        else console.error(`[sante] anomalies non signalees : ${r.raison || 'raison inconnue'}`);
      } catch (err) {
        // La surveillance ne se surveille pas elle-meme : si elle tombe, il ne
        // reste que la console. C'est acceptable — elle ne fait qu'une lecture
        // en base et un envoi, et une panne ici n'empeche aucune autre tache de
        // tourner.
        console.error('[sante] ECHEC :', err.message);
      }
    },
    { timezone: 'Europe/Paris' }
  );

  console.log('Surveillance des taches active : tous les jours a 9 h 07');
}

module.exports = { startSanteCron };
