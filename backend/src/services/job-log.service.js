/**
 * Le journal des taches automatiques.
 *
 * Une seule question, posee pour chaque tache qui tourne toute seule : quand
 * a-t-elle reussi pour la derniere fois ? Sans reponse, une tache qui s'arrete
 * ne previent personne. C'est exactement ce qui est arrive aux sauvegardes :
 * elles n'ont rien envoye pendant des jours, le `catch` ne se declenchait pas,
 * et rien nulle part ne disait que la derniere copie datait de la semaine
 * d'avant.
 *
 * Une ligne par tache, ecrasee a chaque passage. On ne garde pas l'historique :
 * ce qu'on veut savoir, c'est l'etat presente, et un historique qu'on ne
 * consulte jamais est une table qui grossit pour rien.
 *
 * Trois principes.
 *
 * Le journal n'echoue jamais bruyamment. Aucune de ces fonctions ne leve : une
 * sauvegarde ne doit pas rater parce que la ligne qui la raconte n'a pas pu
 * s'ecrire. On enregistre au mieux, et on continue.
 *
 * Il enregistre aussi les echecs, pas seulement les reussites. Un `lastErrorAt`
 * plus recent que le `lastSuccessAt` est l'information la plus utile du lot :
 * la tache tourne bien, mais elle echoue.
 *
 * Et il tolere que la table n'existe pas encore. Entre le deploiement du code et
 * le passage du SQL, elle sera absente pendant quelques minutes. Pendant ce
 * temps le journal se tait au lieu de faire tomber ce qu'il observe.
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/** Les taches connues. Le nom sert de cle, il ne change plus une fois ecrit. */
const TACHES = {
  SAUVEGARDE: 'sauvegarde',
  RESULTATS: 'resultats',
  CLASSEMENT: 'classement',
  COMPOSITIONS: 'compositions',
  STATISTIQUES: 'statistiques',
  BILAN: 'bilan',
};

/**
 * Le journal est accessoire, donc il avale ses propres pannes.
 *
 * Y compris celle-ci, la plus probable : la table absente. Prisma rend alors un
 * P2021 (« the table does not exist »), qu'on traite comme une absence de
 * donnee et non comme une erreur — le code peut etre deploye avant le SQL.
 */
async function sansBruit(quoi, action) {
  try {
    return await action();
  } catch (err) {
    if (err?.code !== 'P2021') {
      console.error(`[journal] ${quoi} : ${err.message.split('\n')[0]}`);
    }
    return null;
  }
}

/** Coupe un message d'erreur a la longueur de la colonne. */
const court = (s) => String(s || '').split('\n')[0].slice(0, 480);

/**
 * Enregistre une reussite, et efface l'echec precedent.
 *
 * L'effacement compte : sans lui, une erreur d'il y a trois semaines resterait
 * affichee a cote d'une reussite du matin, et on ne saurait plus laquelle des
 * deux decrit l'etat present.
 */
async function succes(job, details = null) {
  const maintenant = new Date();
  return sansBruit(`succes ${job}`, () =>
    prisma.jobRun.upsert({
      where: { job },
      create: { job, lastSuccessAt: maintenant, details: details ?? undefined },
      update: {
        lastSuccessAt: maintenant,
        details: details ?? undefined,
        lastError: null,
        lastErrorAt: null,
      },
    })
  );
}

/** Enregistre un echec, sans toucher a la date de la derniere reussite. */
async function echec(job, err) {
  const maintenant = new Date();
  return sansBruit(`echec ${job}`, () =>
    prisma.jobRun.upsert({
      where: { job },
      create: { job, lastErrorAt: maintenant, lastError: court(err?.message || err) },
      update: { lastErrorAt: maintenant, lastError: court(err?.message || err) },
    })
  );
}

/** L'etat d'une tache, ou `null` si elle n'a jamais rien enregistre. */
async function dernier(job) {
  return sansBruit(`lecture ${job}`, () => prisma.jobRun.findUnique({ where: { job } }));
}

/** L'etat de toutes les taches, les plus recemment actives d'abord. */
async function toutes() {
  return (
    (await sansBruit('lecture globale', () =>
      prisma.jobRun.findMany({ orderBy: { updatedAt: 'desc' } })
    )) || []
  );
}

/**
 * L'age en jours, arrondi au jour entier ecoule.
 *
 * `null` pour une date absente, et non zero : « aucune sauvegarde » et
 * « sauvegarde de ce matin » ne doivent surtout pas se confondre.
 */
function joursDepuis(date, now = new Date()) {
  if (!date) return null;
  return Math.floor((now - new Date(date)) / 86400000);
}

/**
 * Une tache est-elle en retard ?
 *
 * Le seuil est propre a chaque tache et se donne en jours. Pour les
 * sauvegardes : elles passent le samedi et le lundi, donc deux fois par semaine,
 * et le plus grand intervalle normal est de cinq jours (du lundi au samedi). A
 * huit jours, une sauvegarde a forcement manque son tour.
 */
function enRetard(etat, seuilJours) {
  const j = joursDepuis(etat?.lastSuccessAt);
  return j === null || j > seuilJours;
}

module.exports = { TACHES, succes, echec, dernier, toutes, joursDepuis, enRetard };
