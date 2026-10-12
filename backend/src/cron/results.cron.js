const cron = require('node-cron');
const { syncResults, shouldSync } = require('../services/results-sync.service');
const { syncStandings, etatFraicheur } = require('../services/standings.service');
const journal = require('../services/job-log.service');

/**
 * Suivi des scores pendant les matchs.
 *
 * Toutes les trois minutes. Ce n'est pas gratuit — chaque passage demande une
 * page a la LNR et une reponse aux deux autres sources — mais `shouldSync()`
 * fait barrage : hors week-end de championnat, le cron se reduit a une requete
 * en base et s'arrete la. Le cout reel est donc concentre sur les neuf heures
 * de rugby du samedi et du dimanche, ou une lecture toutes les trois minutes
 * est un rythme raisonnable pour un site qu'on consulte.
 *
 * Trois minutes plutot qu'une : un essai transforme met une bonne minute a
 * apparaitre sur la page de la LNR, et descendre en dessous ne gagnerait donc
 * rien d'autre que du trafic.
 */
const RYTHME = process.env.SYNC_CRON || '*/3 * * * *';

/**
 * Le classement se recalcule quand il ne reflete pas tous les resultats connus.
 *
 * C'est le point qui merite l'explication, parce que la version precedente
 * paraissait juste et ne l'etait pas.
 *
 * Le premier reflexe serait de recalculer des que la synchronisation signale un
 * changement. Mauvaise idee : pendant un match le score bouge sans arret, et
 * l'on relirait toutes les journees de la saison sur la LNR toutes les trois
 * minutes pendant neuf heures, pour un classement qui ne bouge pas tant que
 * l'arbitre n'a pas siffle.
 *
 * Le deuxieme reflexe — le mien — etait de compter les rencontres terminees
 * avant et apres, et de recalculer quand ce nombre augmente. Ca a l'air
 * imparable et ca a echoue des la J4 : ESPN a declare Pau–La Rochelle termine,
 * le compte a augmente, le recalcul s'est declenche — mais la LNR n'avait pas
 * encore publie le score. Le classement a donc ete recalcule SANS ce match, et
 * comme le declencheur ne se rearme qu'a la transition suivante, il n'y en a
 * plus eu. Le tableau est reste faux jusqu'au filet de securite suivant.
 *
 * La lecon : un declencheur fonde sur un EVENEMENT ne rattrape jamais son
 * echec, puisque l'evenement ne se reproduit pas. On compare donc un ETAT —
 * le nombre de rencontres que le tableau compte contre le nombre que la base
 * connait — et tant qu'il y a un ecart, chaque passage retente. Une source qui
 * publie avec dix minutes de retard est alors rattrapee au passage suivant,
 * sans que personne n'ait a s'en apercevoir.
 */
function startResultsCron() {
  cron.schedule(
    RYTHME,
    async () => {
      /**
       * Celle-ci ne passe pas par `journal.passe`, et c'est le seul cas.
       *
       * Elle se declenche toutes les trois minutes, soit cinq cents fois par
       * jour, et n'a rien a faire la plupart du temps. Enregistrer chacun de ces
       * passages voudrait dire cinq cents ecritures quotidiennes pour une ligne
       * dont on ne lit qu'une date — et surtout, ce serait inutile : ce qu'on
       * veut savoir d'une tache si frequente, c'est si elle echoue, pas si elle
       * a tourne il y a trois minutes.
       *
       * On n'enregistre donc une reussite que lorsqu'elle a reellement
       * travaille. En consequence, cette tache n'a pas de seuil de retard dans
       * la surveillance : son silence pendant la treve est normal. C'est le
       * recalcul du classement, trois fois par jour et dans le meme processus,
       * qui signale un serveur qui ne tourne plus.
       */
      try {
        if (!(await shouldSync())) return;

        await syncResults();

        const etat = await etatFraicheur();
        if (!etat.aJour) {
          console.log(
            `[cron] classement en retard : ${etat.comptees} rencontre(s) comptee(s) ` +
            `sur ${etat.termines} terminee(s), relecture`
          );
          await syncStandings();
        }

        await journal.succes(journal.TACHES.RESULTATS, {
          comptees: etat.comptees,
          termines: etat.termines,
        });
      } catch (err) {
        console.error('[cron] erreur resultats :', err.message);
        await journal.echec(journal.TACHES.RESULTATS, err);
      }
    },
    { timezone: 'Europe/Paris' }
  );

  /**
   * Filet de securite, trois fois par jour.
   *
   * Il sert au cas ou un resultat serait entre en base autrement que par la
   * synchronisation — une correction a la main, par exemple — et donc sans
   * declencher le recalcul ci-dessus. Les minutes ne sont pas rondes a
   * dessein : les taches programmees a l'heure pile se bousculent.
   *
   * C'est aussi lui qui sert de pouls au serveur : il passe tous les jours,
   * saison ou treve, et son silence pendant plus de deux jours veut dire que
   * quelque chose de bien plus large qu'une source de donnees est tombe.
   */
  cron.schedule(
    '17 8,13,23 * * *',
    () => journal.passe(journal.TACHES.CLASSEMENT, () => syncStandings()),
    { timezone: 'Europe/Paris' }
  );

  console.log(`Cron actif : resultats ${RYTHME}, classement au coup de sifflet + 3 fois par jour`);
}

module.exports = { startResultsCron };
