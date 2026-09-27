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
 *
 * Et le samedi a 12 h 30, avant le premier coup d'envoi. Ce second creneau ne
 * protege pas le meme risque : le lundi met a l'abri le week-end qui vient de
 * se jouer, le samedi met a l'abri les pronostics saisis le jeudi et le
 * vendredi. Sans lui, une panne le samedi matin coute la journee entiere de
 * pronostics — c'est-a-dire la seule chose qu'on ne peut pas reconstituer.
 */

/**
 * Le nom du fichier joint, et pourquoi il finit par .txt.
 *
 * Brevo n'accepte qu'une liste fermee d'extensions en piece jointe — pdf, csv,
 * txt, zip, xml et une trentaine d'autres — et `.gz` n'en fait pas partie. Un
 * fichier nomme `top14-2026-09-28.json.gz` est refuse par l'API avec un 400
 * seche, avant meme d'etre regarde.
 *
 * Le contenu reste compresse : 400 ko de JSON tombent sous les 40 ko, et la
 * sauvegarde grossira toute la saison a mesure que s'ajoutent compositions et
 * statistiques. On change donc le nom, pas le format.
 *
 * Le `.json.gz` reste visible dans le nom pour dire ce que c'est vraiment, et
 * le `.txt` final est la pour l'API. Rien a renommer avant de restaurer :
 * `parseDump` reconnait un fichier gzip a ses deux premiers octets, pas a son
 * extension. La restauration fonctionne donc telle quelle.
 */
const nomFichier = (jour) => `top14-${jour}.json.gz.txt`;

async function envoyer(quand) {
  const { buf, counts, exportedAt } = await exportGzip();
  const jour = exportedAt.slice(0, 10);
  const ko = Math.round(buf.length / 1024);

  const lignes = Object.entries(counts)
    .map(([k, v]) => `${k} : ${v}`)
    .join(' · ');

  await mailer.send({
    to: process.env.BACKUP_EMAIL_TO,
    subject: `Sauvegarde Top 14 — ${jour} (${ko} ko)`,
    text: `Sauvegarde automatique de la base (${quand}).\n\n${lignes}\n\n` +
          `Pour restaurer : node scripts/restore-backup.js <fichier> --force\n` +
          `Le fichier est compresse malgre son extension .txt — le script le reconnait seul.`,
    html: `<p>Sauvegarde automatique de la base (${quand}).</p><p>${lignes}</p>` +
          `<p style="color:#666">Pour restaurer : ` +
          `<code>node scripts/restore-backup.js &lt;fichier&gt; --force</code><br>` +
          `Le fichier est compressé malgré son extension <code>.txt</code> — le script le reconnaît seul.</p>`,
    attachments: [{ name: nomFichier(jour), content: buf }],
  });

  console.log(`[sauvegarde] ${quand} : envoyee a ${process.env.BACKUP_EMAIL_TO} (${ko} ko)`);
  return { ko, counts };
}

function startBackupCron() {
  const destinataire = process.env.BACKUP_EMAIL_TO;
  if (!destinataire) {
    console.log('Sauvegarde par e-mail inactive (BACKUP_EMAIL_TO absent)');
    return;
  }

  const planifier = (horaire, quand) =>
    cron.schedule(
      horaire,
      async () => {
        try {
          await envoyer(quand);
        } catch (err) {
          // Une sauvegarde qui echoue en silence est pire que pas de sauvegarde :
          // on croit etre couvert et on ne l'est pas.
          //
          // Ce `catch` n'a longtemps rien attrape, non pas parce qu'il etait mal
          // ecrit, mais parce que l'envoi ne levait jamais : le transport SMTP
          // n'avait aucun delai maximum et restait suspendu indefiniment. Un
          // `catch` ne se declenche que si quelque chose est leve. Le plafond
          // pose depuis dans `mailer.service` est ce qui rend cette ligne utile.
          console.error(`[sauvegarde] ECHEC (${quand}) :`, err.message);
        }
      },
      { timezone: 'Europe/Paris' }
    );

  planifier('30 4 * * 1', 'lundi');
  planifier('30 12 * * 6', 'samedi');

  console.log(`Sauvegardes actives : lundi 4 h 30 et samedi 12 h 30 -> ${destinataire}`);
}

module.exports = { startBackupCron, envoyer, nomFichier };
