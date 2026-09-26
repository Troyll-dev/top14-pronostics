const express = require('express');
const router = express.Router();
const { syncStandings, getStandings } = require('../services/standings.service');

/**
 * Le secret ne se lit que dans l'en-tete `x-sync-secret`, jamais dans
 * `?secret=` — un parametre d'URL se retrouve dans les journaux du serveur,
 * dans l'historique du navigateur, dans l'en-tete `Referer` et dans les
 * captures d'ecran, et aucune de ces traces ne se reprend. Meme raison que
 * dans sync.routes.js.
 */
function authorize(req) {
  const provided = req.headers['x-sync-secret'];
  const expected = process.env.SYNC_SECRET;
  if (expected && provided === expected) return true;
  return !!req.user;
}

// GET /api/standings — classement enregistre + forme des equipes
router.get('/', async (req, res) => {
  try {
    res.json(await getStandings());
  } catch (err) {
    console.error('[classement] lecture :', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET|POST /api/standings/refresh — recalcule le classement et l'enregistre
//   ?dry=1    simule sans rien ecrire
//   ?debug=1  ajoute les nombres bruts, pour caler l'analyseur
async function refresh(req, res) {
  if (!authorize(req)) return res.status(401).json({ error: 'Non autorise' });
  try {
    const report = await syncStandings({
      dryRun: req.query.dry === '1',
      debug: req.query.debug === '1',
    });
    res.json(report);
  } catch (err) {
    console.error('[classement] erreur :', err.message);
    res.status(500).json({ error: 'Echec de la lecture', detail: err.message });
  }
}

router.get('/refresh', refresh);
router.post('/refresh', refresh);

module.exports = router;
