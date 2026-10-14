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
 * ce qu'on veut savoir, c'est l'etat present, et un historique qu'on ne
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
 *
 * ---------------------------------------------------------------------------
 * CE QUE « REUSSITE » VEUT DIRE ICI
 * ---------------------------------------------------------------------------
 *
 * Une passe qui s'execute sans lever est une reussite, **meme si elle n'a rien
 * trouve a faire**. C'est voulu, et c'est ce qui rend la surveillance possible.
 *
 * Si l'on n'enregistrait que les passes ayant change quelque chose, une tache
 * muette serait indistinguable d'une tache morte : hors saison, les
 * compositions n'ont rien a lire pendant trois mois, et on ne saurait pas si
 * c'est normal ou si le cron ne tourne plus. En notant chaque passage, le
 * journal repond a la question qui compte — la tache s'execute-t-elle encore ?
 * — et le detail dit ce qu'elle a trouve.
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * L'instant ou ce processus a demarre.
 *
 * Il sert a une seule chose, et elle est essentielle : savoir si une question a
 * un sens avant d'y repondre. Une tache qui passe a 6 h 20 et un serveur
 * redemarre a 11 h donnent une ligne de journal vide — mais cette tache n'est
 * pas en panne, elle n'a simplement pas encore eu son tour.
 *
 * Sans ce repere, le premier matin qui suit un deploiement fait partir une
 * alerte annoncant cinq pannes imaginaires. Et une alerte qui se trompe une
 * fois sur deux ne se lit plus : on la classe, et le jour ou elle dit vrai,
 * elle est classee avec les autres. Mieux vaut se taire que crier a tort.
 *
 * Railway redemarre le conteneur a chaque deploiement, donc ce repere se remet
 * a zero souvent. C'est voulu : apres un deploiement, on ne sait reellement
 * rien de l'etat des taches tant qu'elles n'ont pas eu l'occasion de passer.
 */
const DEMARRAGE = new Date();

/** Depuis combien de jours ce processus tourne-t-il ? */
const joursDeMarche = (now = new Date()) => (now - DEMARRAGE) / 86400000;

/** Les taches connues. Le nom sert de cle, il ne change plus une fois ecrit. */
const TACHES = {
  SAUVEGARDE: 'sauvegarde',
  RESULTATS: 'resultats',
  CLASSEMENT: 'classement',
  COMPOSITIONS: 'compositions',
  STATISTIQUES: 'statistiques',
  HORAIRES: 'horaires',
  METEO: 'meteo',
  RAPPELS: 'rappels',
  BILAN: 'bilan',
};

/**
 * Au bout de combien de jours sans reussite une tache est-elle en panne ?
 *
 * Un seuil par tache, parce qu'elles n'ont pas le meme rythme, et toujours plus
 * large que l'intervalle normal : un seuil trop serre produit de fausses
 * alertes, et une alerte a laquelle on ne croit plus ne sert a rien.
 *
 *   sauvegarde    passe le lundi et le samedi ; plus grand intervalle normal
 *                 cinq jours (lundi -> samedi), donc huit.
 *   horaires      une fois par jour, donc deux.
 *   meteo         deux fois par jour, donc deux. Hors saison elle ne releve
 *                 rien mais enregistre son passage, comme les autres.
 *   compositions  quatre fois par jour, donc deux.
 *   statistiques  deux fois par jour, donc deux.
 *   classement    trois fois par jour par le filet de securite, donc deux.
 *   rappels       le vendredi, et il ne dit rien les semaines sans journee a
 *                 venir — il enregistre quand meme son passage, donc neuf.
 *   bilan         le lundi, mais il ne dit rien les semaines sans journee
 *                 terminee — il enregistre quand meme son passage, donc neuf.
 *
 * `resultats` n'a volontairement pas de seuil. La passe ne fait rien hors
 * week-end de championnat, et n'enregistre donc une reussite que lorsqu'elle a
 * reellement travaille : en treve, son silence est normal et un seuil
 * declencherait une alerte chaque semaine. Elle reste surveillee par ses
 * echecs, et le classement — qui passe trois fois par jour dans le meme
 * processus — signale de toute facon un serveur qui ne tourne plus.
 */
const SEUILS_JOURS = {
  [TACHES.SAUVEGARDE]: 8,
  [TACHES.HORAIRES]: 2,
  [TACHES.METEO]: 2,
  [TACHES.COMPOSITIONS]: 2,
  [TACHES.STATISTIQUES]: 2,
  [TACHES.CLASSEMENT]: 2,
  [TACHES.RAPPELS]: 9,
  [TACHES.BILAN]: 9,
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

/**
 * Enveloppe une passe : elle enregistre son resultat sans qu'on y pense.
 *
 * Ecrite parce que les six crons repetaient tous le meme `try / catch /
 * journal.succes / journal.echec`, et qu'une repetition de cette sorte finit
 * toujours par etre oubliee dans le septieme. Ici, instrumenter une nouvelle
 * tache tient en une ligne.
 *
 * Elle ne relance pas l'erreur : un cron n'a personne a qui la rendre, et une
 * exception non rattrapee dans un `setInterval` fait tomber le processus. Elle
 * la journalise, l'ecrit en base, et la passe suivante retentera.
 */
async function passe(job, action) {
  try {
    const r = await action();
    await succes(job, r && typeof r === 'object' ? r : undefined);
    return r;
  } catch (err) {
    console.error(`[${job}] ECHEC :`, err.message);
    await echec(job, err);
    return null;
  }
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

/**
 * Ce qui ne va pas, en ce moment.
 *
 * Deux sortes d'anomalies, et il faut les distinguer parce qu'elles ne se
 * reparent pas pareil :
 *
 *   « echec »  la tache tourne mais se termine en erreur. On a un message, donc
 *              une piste. C'est le cas facile.
 *
 *   « muette » la tache n'a rien enregistre depuis trop longtemps. Soit le cron
 *              ne se declenche plus, soit le serveur a redemarre sans relancer
 *              la tache, soit l'appel a ete oublie dans `app.js` — ce qui est
 *              deja arrive avec les rappels du vendredi. Pas de message
 *              d'erreur, et c'est justement pour ca que ce cas-la ne se voyait
 *              nulle part.
 *
 * Une tache jamais enregistree est muette, pas absente : sur un serveur qui
 * tourne depuis plus longtemps que le plus grand des seuils, ne jamais avoir
 * rien ecrit est une panne en soi. Le rapport dit quand meme « jamais », pour
 * qu'on ne cherche pas une regression la ou il n'y a qu'un premier demarrage.
 */
async function anomalies(now = new Date()) {
  const etats = await toutes();
  const parNom = Object.fromEntries(etats.map((e) => [e.job, e]));
  const liste = [];

  const marche = joursDeMarche(now);

  for (const [job, seuil] of Object.entries(SEUILS_JOURS)) {
    const e = parNom[job];
    const jours = joursDepuis(e?.lastSuccessAt, now);

    /**
     * Le serveur a-t-il tourne assez longtemps pour que la question se pose ?
     *
     * Si non, on se tait sur le retard — mais pas sur les echecs, qui restent
     * signales plus bas : une erreur enregistree est une erreur, quelle que
     * soit l'anciennete du processus.
     *
     * Le silence dure au plus le seuil de la tache, donc deux jours pour la
     * plupart. C'est le prix a payer pour ne jamais crier a tort, et c'est le
     * bon prix : une tache reellement morte le reste, et sera signalee le
     * surlendemain.
     */
    if (marche < seuil && !e?.lastSuccessAt) continue;

    if (jours === null || jours > seuil) {
      liste.push({ job, type: 'muette', jours, seuil, jamais: !e?.lastSuccessAt });
      continue;
    }
    if (e?.lastErrorAt && (!e.lastSuccessAt || e.lastErrorAt > e.lastSuccessAt)) {
      liste.push({ job, type: 'echec', message: e.lastError, quand: e.lastErrorAt });
    }
  }

  // Les resultats n'ont pas de seuil (voir SEUILS_JOURS) mais leurs echecs
  // comptent comme ceux des autres.
  const r = parNom[TACHES.RESULTATS];
  if (r?.lastErrorAt && (!r.lastSuccessAt || r.lastErrorAt > r.lastSuccessAt)) {
    liste.push({ job: TACHES.RESULTATS, type: 'echec', message: r.lastError, quand: r.lastErrorAt });
  }

  return liste;
}

module.exports = {
  TACHES, SEUILS_JOURS, DEMARRAGE, joursDeMarche,
  succes, echec, passe,
  dernier, toutes,
  joursDepuis, enRetard, anomalies,
};
