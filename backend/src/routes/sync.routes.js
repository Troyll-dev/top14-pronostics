const express = require('express');
const router = express.Router();
const { syncResults } = require('../services/results-sync.service');

/**
 * Autorise l'appel si :
 *  - le bon secret est fourni dans l'en-tete `x-sync-secret` (cron externe), ou
 *  - l'utilisateur est connecte (bouton depuis /admin)
 *
 * Le secret ne se lit QUE dans l'en-tete, jamais dans `?secret=`.
 *
 * Pourquoi ce retrait. Un parametre d'URL laisse des traces partout et on ne
 * peut pas les reprendre : les journaux du serveur enregistrent l'URL complete,
 * l'historique du navigateur la garde, elle part dans l'en-tete `Referer` vers
 * tout site qu'on visiterait ensuite, et elle se retrouve dans les captures
 * d'ecran et les copier-coller. Un secret qui voyage dans une adresse n'est
 * plus un secret, c'est un mot de passe affiche.
 *
 * Concretement : un cron externe doit desormais envoyer l'en-tete. Sur
 * cron-job.org c'est l'onglet « Headers » ; en ligne de commande :
 *
 *   curl -X POST -H "x-sync-secret: <le secret>" https://…/api/sync/results
 */
function authorize(req) {
  const provided = req.headers['x-sync-secret'];
  const expected = process.env.SYNC_SECRET;
  if (expected && provided === expected) return true;
  return !!req.user;
}

// POST /api/sync/results         -> synchronise pour de vrai
// POST /api/sync/results?dry=1   -> simule, n'ecrit rien
router.post('/results', async (req, res) => {
  if (!authorize(req)) return res.status(401).json({ error: 'Non autorise' });

  try {
    const report = await syncResults({ dryRun: req.query.dry === '1' });
    res.json(report);
  } catch (err) {
    console.error('[sync] erreur :', err.message);
    res.status(500).json({ error: 'Echec de la synchronisation', detail: err.message });
  }
});

// GET = meme chose, pratique pour les crons externes qui n'envoient que des GET
router.get('/results', async (req, res) => {
  if (!authorize(req)) return res.status(401).json({ error: 'Non autorise' });

  try {
    const report = await syncResults({ dryRun: req.query.dry === '1' });
    res.json(report);
  } catch (err) {
    console.error('[sync] erreur :', err.message);
    res.status(500).json({ error: 'Echec de la synchronisation', detail: err.message });
  }
});

module.exports = router;
