const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { authenticate } = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/admin.middleware');
const journal = require('../services/job-log.service');
const sante = require('../services/sante.service');

const prisma = new PrismaClient();

/**
 * L'etat de sante du site, pour l'administration.
 *
 * ---------------------------------------------------------------------------
 * CE QU'ELLE EST, ET CE QU'ELLE N'EST PAS
 * ---------------------------------------------------------------------------
 *
 * Elle ne remplace pas l'alerte du matin, elle la complete. L'alerte dit qu'il
 * y a un probleme et vient te chercher ; cette route dit lequel, depuis quand,
 * et avec quel message — c'est-a-dire ce qu'on veut savoir une fois qu'on est
 * devant l'ecran. Construire la page sans l'alerte aurait refait l'erreur des
 * journaux de console : une information juste, posee la ou personne ne va la
 * chercher.
 *
 * ---------------------------------------------------------------------------
 * LES DEUX MIDDLEWARES, DANS CET ORDRE
 * ---------------------------------------------------------------------------
 *
 * `authenticate` pose `req.user`, `requireAdmin` le lit. Inverser les deux
 * ferait refuser tout le monde — avec la bonne erreur pour la mauvaise raison,
 * ce qui est la pire facon d'avoir raison.
 *
 * `router.use` plutot que de les repeter sur chaque route : une route ajoutee
 * ici dans six mois sera protegee sans qu'on y pense, et c'est exactement ce
 * qu'on veut d'un fichier qui expose des adresses de courriel.
 */
router.use(authenticate, requireAdmin);

/** Toutes les taches connues, meme celles qui n'ont jamais rien ecrit. */
async function taches() {
  const lignes = await journal.toutes();
  const parNom = Object.fromEntries(lignes.map((l) => [l.job, l]));

  return Object.values(journal.TACHES).map((job) => {
    const e = parNom[job] || null;
    const seuil = journal.SEUILS_JOURS[job] ?? null;
    const jours = journal.joursDepuis(e?.lastSuccessAt);

    /**
     * Quatre etats, et le dernier merite son existence.
     *
     *   echec    la derniere nouvelle est une erreur. On a un message.
     *   retard   elle a reussi, mais il y a trop longtemps.
     *   jamais   rien, jamais, sur un serveur qui tourne depuis plus longtemps
     *            que le seuil de la tache. C'est alors le signe d'un cron qui
     *            n'a pas ete demarre — ce qui est arrive aux rappels du
     *            vendredi, et ne se voyait nulle part.
     *   attente  rien encore, mais le serveur vient de redemarrer et la tache
     *            n'a pas eu son tour. Ce n'est pas une panne, c'est une absence
     *            de reponse — et les deux ne se peignent pas de la meme
     *            couleur. Apres un deploiement a 11 h, les horaires de 6 h 20
     *            sont dans ce cas jusqu'au lendemain matin.
     *   ok       elle a reussi recemment.
     *
     * `suivie: false` pour les resultats : ils n'ont pas de seuil, leur silence
     * hors saison etant normal. L'ecran le dit plutot que d'afficher un vert
     * qui laisserait croire a une verification qui n'a pas lieu.
     */
    const marche = journal.joursDeMarche();

    /**
     * Une tache sans seuil ne peut jamais etre « jamais vue ».
     *
     * C'est le cas des resultats : ils n'enregistrent une reussite que
     * lorsqu'ils ont reellement travaille, donc hors week-end de championnat
     * leur ligne reste vide — pendant toute une treve si besoin. Les peindre en
     * rouge serait signaler comme panne le fonctionnement normal.
     *
     * La regle generale : on ne reproche un silence qu'a une tache dont on
     * attend quelque chose a une date connue. Sans seuil, pas d'attente, donc
     * pas de reproche.
     */
    const sansAttente = seuil === null || marche < seuil;

    let etat = 'ok';
    if (e?.lastErrorAt && (!e.lastSuccessAt || e.lastErrorAt > e.lastSuccessAt)) etat = 'echec';
    else if (!e?.lastSuccessAt) etat = sansAttente ? 'attente' : 'jamais';
    else if (seuil !== null && jours !== null && jours > seuil) etat = 'retard';

    return {
      job,
      libelle: sante.LIBELLES[job] || job,
      etat,
      suivie: seuil !== null,
      seuil,
      jours,
      minutesDeMarche: Math.round(journal.joursDeMarche() * 24 * 60),
      lastSuccessAt: e?.lastSuccessAt || null,
      lastErrorAt: e?.lastErrorAt || null,
      lastError: e?.lastError || null,
      details: e?.details || null,
    };
  });
}

/**
 * GET /api/admin/sante
 *
 * Les taches, les anomalies telles que l'alerte du matin les verrait, et les
 * joueurs dont l'adresse n'est pas confirmee.
 *
 * Les trois dans la meme reponse, parce qu'ils repondent a la meme question —
 * est-ce que quelque chose cloche ? — et qu'un seul aller-retour vaut mieux que
 * trois pour une page qu'on ouvre rarement.
 */
router.get('/', async (req, res) => {
  try {
    const [liste, anomalies, nonConfirmes] = await Promise.all([
      taches(),
      journal.anomalies(),
      prisma.user.findMany({
        where: { emailVerifie: false },
        select: { id: true, username: true, email: true, createdAt: true, enPause: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    res.json({ taches: liste, anomalies, nonConfirmes });
  } catch (err) {
    console.error('[sante] lecture :', err.message);
    res.status(500).json({ error: 'Lecture impossible', detail: err.message });
  }
});

/**
 * POST /api/admin/sante/simuler
 *
 * Rend le message que l'alerte enverrait ce matin, sans l'envoyer.
 *
 * Ca existe pour une raison precise : un dispositif qui ne se manifeste qu'en
 * cas de panne ne se verifie jamais. On ne saurait pas s'il fonctionne encore,
 * et le jour ou une panne arrive, on ne saurait pas non plus s'il s'est tu
 * parce que tout va bien ou parce qu'il est casse. Un bouton qui montre ce
 * qu'il dirait leve ce doute en une seconde.
 */
router.post('/simuler', async (req, res) => {
  try {
    const r = await sante.verifier({ dryRun: true });
    res.json(r);
  } catch (err) {
    console.error('[sante] simulation :', err.message);
    res.status(500).json({ error: 'Simulation impossible', detail: err.message });
  }
});

module.exports = router;
