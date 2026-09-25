const cron = require('node-cron');
const { exportGzip } = require('../services/backup.service');
const mailer = require('../services/mailer.service');

/**
 * Sauvegarde hebdomadaire envoyee par courriel.
 *
 * L'interet n'est pas la frequence mais le fait qu'elle parte d'elle-meme :
 * une sauvegarde qui depend de la discipline de quelqu'un n'existe pas. Elle
 * quitte l'hebergeur, ce qui est tout l'enjeu — une copie restee sur Railway
 * disparait avec Railway.
 *
 * Le lundi a 4 h 30 : la journee de championnat est finie, les scores sont
 * homologues, et la sauvegarde contient donc un week-end complet.
 */
function startBackupCron() {
  const destinataire = process.env.BACKUP_EMAIL_TO;
  if (!destinataire) {
    console.log('Sauvegarde par e-mail inactive (BACKUP_EMAIL_TO absent)');
    return;
  }

  cron.schedule(
    '30 4 * * 1',
    async () => {
      try {
        const { buf, counts, exportedAt } = await exportGzip();
        const jour = exportedAt.slice(0, 10);
        const ko = Math.round(buf.length / 1024);

        const lignes = Object.entries(counts)
          .map(([k, v]) => `${k} : ${v}`)
          .join(' · ');

        await mailer.send({
          to: destinataire,
          subject: `Sauvegarde Top 14 — ${jour} (${ko} ko)`,
          text: `Sauvegarde automatique de la base.\n\n${lignes}\n\n` +
                `Pour restaurer : node scripts/restore-backup.js <fichier> --force`,
          html: `<p>Sauvegarde automatique de la base.</p><p>${lignes}</p>` +
                `<p style="color:#666">Pour restaurer : ` +
                `<code>node scripts/restore-backup.js &lt;fichier&gt; --force</code></p>`,
          attachments: [{ name: `top14-${jour}.json.gz`, content: buf }],
        });

        console.log(`[sauvegarde] envoyee a ${destinataire} (${ko} ko)`);
      } catch (err) {
        // Une sauvegarde qui echoue en silence est pire que pas de sauvegarde :
        // on croit etre couvert et on ne l'est pas.
        console.error('[sauvegarde] ECHEC de l envoi hebdomadaire :', err.message);
      }
    },
    { timezone: 'Europe/Paris' }
  );

  console.log(`Sauvegarde hebdomadaire active : lundi 4 h 30 -> ${destinataire}`);
}

module.exports = { startBackupCron };
