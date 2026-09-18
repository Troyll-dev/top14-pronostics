const express = require('express');
const router = express.Router();
const { syncResults } = require('../services/results-sync.service');

/**
 * Autorise l'appel si :
 *  - le bon secret est fourni (cron externe type cron-job.org), ou
 *  - l'utilisateur est connecte (bouton depuis /admin)
 */
function authorize(req) {
  const provided = req.headers['x-sync-secret'] || req.query.secret;
  const expected = process.env.SYNC_SECRET;
  if (expected && provided === expected) return true;
  return !!req.user;
}

// POST /api/sync/results         -> synchronise pour de vrai
// POST /api/sync/results?dry=1   -> simule, n'ecrit rien (pour verifier la correspondance des equipes)
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
