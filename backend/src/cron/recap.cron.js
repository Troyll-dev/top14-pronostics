const cron = require('node-cron');
const { envoyerRecap } = require('../services/recap.service');

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
 */
function startRecapCron() {
  if (process.env.RECAP === 'off') {
    console.log('Bilan du lundi desactive (RECAP=off)');
    return;
  }

  cron.schedule(
    '0 8 * * 1',
    async () => {
      try {
        const r = await envoyerRecap();
        if (r.raison) return console.log(`[bilan] ${r.raison}`);
        console.log(
          `[bilan] J${r.round} : ${r.envoyes.length} envoye(s)` +
          (r.ignores.length ? `, ${r.ignores.length} ignore(s)` : '') +
          (r.erreurs.length ? `, ${r.erreurs.length} erreur(s)` : '')
        );
        for (const e of r.erreurs) console.error(`[bilan] ${e}`);
      } catch (err) {
        console.error('[bilan] ECHEC :', err.message);
      }
    },
    { timezone: 'Europe/Paris' }
  );

  console.log('Bilan du lundi actif : lundi 8 h');
}

module.exports = { startRecapCron };
