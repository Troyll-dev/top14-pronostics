/**
 * Un essai de relevé météo, sans rien écrire.
 *
 *   node scripts/meteo-essai.js
 *
 * À lancer une fois, avant de faire confiance à la tâche automatique. Il affiche
 * les prochaines rencontres, le stade reconnu pour chacune, et ce qu'Open-Meteo
 * répond à l'heure du coup d'envoi. Aucune écriture en base.
 *
 * Il existe pour une raison précise : je n'ai pas pu appeler Open-Meteo depuis
 * l'endroit où ce code a été écrit — le réseau y refusait ce domaine. La forme
 * exacte de la réponse vient donc de la documentation, et pas d'un appel réel.
 * Ce script est l'appel réel, et il doit passer avant que la tâche de 7 h 42
 * tourne toute seule.
 *
 * Deux choses à vérifier dans sa sortie. Que chaque rencontre a bien trouvé son
 * stade — un club non reconnu s'affiche en clair, et il suffit alors d'ajouter
 * un alias dans `meteo.service.js`. Et que l'heure retenue est bien celle du
 * match : c'est tout l'intérêt du relevé, une moyenne de la journée annoncerait
 * du soleil pour une rencontre de 21 h sous la pluie.
 */

const { PrismaClient } = require('@prisma/client');
const { relever, stadeDe, HORIZON_JOURS } = require('../src/services/meteo.service');

const prisma = new PrismaClient();

async function main() {
  require('dotenv').config();

  const maintenant = new Date();
  const limite = new Date(maintenant.getTime() + HORIZON_JOURS * 86400000);

  const matchs = await prisma.match.findMany({
    where: {
      status: { in: ['SCHEDULED', 'LIVE'] },
      kickoff: { gte: maintenant, lte: limite },
    },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { kickoff: 'asc' },
  });

  if (!matchs.length) {
    console.log(`Aucune rencontre a venir dans les ${HORIZON_JOURS} jours.`);
    console.log('Hors saison ou journee lointaine : c\'est normal, et la tache dira la meme chose.');
    return;
  }

  console.log(`${matchs.length} rencontre(s) dans les ${HORIZON_JOURS} jours.\n`);

  for (const m of matchs) {
    const quand = new Date(m.kickoff).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
    const titre = `${m.homeTeam.name} - ${m.awayTeam.name}`;
    const stade = stadeDe(m.homeTeam);

    if (!stade) {
      console.log(`${titre}  (${quand})`);
      console.log(`   STADE INCONNU pour « ${m.homeTeam.name} » / « ${m.homeTeam.shortName} »`);
      console.log('   -> ajouter cet alias dans STADES, dans meteo.service.js\n');
      continue;
    }

    try {
      const meteo = await relever(m);
      console.log(`${titre}  (${quand})`);
      if (!meteo) {
        console.log(`   ${stade.stade} : pas de prevision utilisable (trop loin, ou heure introuvable)\n`);
        continue;
      }
      // Affiche en heure de Paris, comme le coup d'envoi juste au-dessus :
      // c'est le seul moyen de verifier d'un coup d'oeil que les deux heures
      // correspondent, ce qui est tout l'objet de cet essai.
      const heure = new Date(meteo.heure).toLocaleString('fr-FR', {
        timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      });
      console.log(
        `   ${meteo.stade} · ${heure} · ${meteo.temperature} °C · ` +
        `${meteo.pluie} mm · ${meteo.vent} km/h · ${meteo.libelle}\n`
      );
    } catch (err) {
      console.log(`${titre}  (${quand})`);
      console.log(`   ECHEC : ${err.message}\n`);
    }
  }
}

main()
  .catch((err) => { console.error('\nEchec :', err.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
