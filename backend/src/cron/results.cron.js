const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const { syncResults, shouldSync } = require('../services/results-sync.service');
const { syncStandings } = require('../services/standings.service');

const prisma = new PrismaClient();

const SEASON = process.env.SPORTSDB_SEASON || '2026-2027';

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
 * Le classement ne se recalcule que quand une rencontre vient d'etre
 * homologuee.
 *
 * C'est le point qui merite l'explication. Le reflexe serait de le recalculer
 * des que la synchronisation signale un changement — mais pendant un match le
 * score bouge sans arret, et chaque mouvement serait un changement : on
 * relirait alors toutes les journees de la saison sur la LNR toutes les trois
 * minutes pendant neuf heures, pour un classement qui, lui, ne bouge pas tant
 * que l'arbitre n'a pas siffle.
 *
 * On compte donc les rencontres terminees avant et apres. Un nombre qui a
 * augmente, c'est un resultat de plus : la, et seulement la, le classement a
 * reellement change.
 */
function compterTerminees() {
  return prisma.match.count({ where: { season: SEASON, status: 'FINISHED' } });
}

function startResultsCron() {
  cron.schedule(
    RYTHME,
    async () => {
      try {
        if (!(await shouldSync())) return;

        const avant = await compterTerminees();
        await syncResults();
        const apres = await compterTerminees();

        if (apres > avant) {
          console.log(`[cron] ${apres - avant} rencontre(s) homologuee(s), classement recalcule`);
          await syncStandings();
        }
      } catch (err) {
        console.error('[cron] erreur resultats :', err.message);
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
   */
  cron.schedule(
    '17 8,13,23 * * *',
    async () => {
      try {
        await syncStandings();
      } catch (err) {
        console.error('[cron] erreur classement :', err.message);
      }
    },
    { timezone: 'Europe/Paris' }
  );

  console.log(`Cron actif : resultats ${RYTHME}, classement au coup de sifflet + 3 fois par jour`);
}

module.exports = { startResultsCron };
