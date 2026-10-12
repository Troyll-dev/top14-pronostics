const cron = require('node-cron');
const { envoyerRecap } = require('../services/recap.service');
const journal = require('../services/job-log.service');

/**
 * Lundi 8 h, heure de Paris.
 *
 * Le mail est la au reveil, au moment ou l'on releve ses messages avant de
 * partir, et le week-end est encore frais dans les tetes. Le dimanche soir
 * aurait ete plus immediat, mais a 23 h 45 le message serait lu le lendemain de
 * toute facon — et un retard de publication de la LNR le ferait partir
 * incomplet, ce qui est pire que tard : il annoncerait un vainqueur qui n'en
 * est pas un.
 *
 * Le service ne raconte que les journees **entierement** terminees. Un lundi
 * de treve, ou un lundi apres une journee etalee sur deux week-ends, il ne
 * trouve rien de neuf a dire et n'ecrit a personne : l'unicite est garantie par
 * la base, pas par le calendrier.
 *
 * Pour changer l'heure, une seule ligne — et la syntaxe est « minute heure ».
 *
 * Le passage s'enregistre meme quand il n'y a rien a raconter : c'est ce qui
 * distingue un lundi de treve d'un bilan qui ne part plus. Le seuil d'alerte
 * est a neuf jours, donc un lundi manque se voit des le mardi suivant.
 *
 * Les erreurs d'envoi individuelles — un joueur dont l'adresse rebondit — ne
 * font pas echouer la tache : le bilan est parti aux sept autres, et declarer
 * la passe en echec ferait croire que personne n'a rien recu. Elles restent
 * dans le detail de la ligne, consultable quand on cherche pourquoi un tel ne
 * recoit rien.
 */
function startRecapCron() {
  if (process.env.RECAP === 'off') {
    console.log('Bilan du lundi desactive (RECAP=off)');
    return;
  }

  cron.schedule(
    '0 8 * * 1',
    () =>
      journal.passe(journal.TACHES.BILAN, async () => {
        const r = await envoyerRecap();
        if (r.raison) {
          console.log(`[bilan] ${r.raison}`);
          return { rien: r.raison };
        }
        console.log(
          `[bilan] J${r.round} : ${r.envoyes.length} envoye(s)` +
          (r.ignores.length ? `, ${r.ignores.length} ignore(s)` : '') +
          (r.erreurs.length ? `, ${r.erreurs.length} erreur(s)` : '')
        );
        for (const e of r.erreurs) console.error(`[bilan] ${e}`);
        return {
          journee: r.round,
          envoyes: r.envoyes.length,
          ignores: r.ignores.length,
          erreurs: r.erreurs,
        };
      }),
    { timezone: 'Europe/Paris' }
  );

  console.log('Bilan du lundi actif : lundi 8 h');
}

module.exports = { startRecapCron };
