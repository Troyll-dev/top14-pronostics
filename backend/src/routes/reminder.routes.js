const express = require('express');
const router = express.Router();
const { envoyerRappels } = require('../services/reminder.service');

/**
 * Declenchement manuel, protege par le meme secret que la synchronisation.
 *
 * Son interet principal est `?dry=1`, qui n'ecrit rien et n'envoie rien : il
 * dit qui serait relance. C'est ce qui permet de verifier le comportement un
 * mardi apres-midi, sans attendre vendredi et sans reveiller personne.
 */
router.post('/', async (req, res) => {
  const attendu = process.env.SYNC_SECRET;
  if (!attendu || req.headers['x-sync-secret'] !== attendu) {
    return res.status(401).json({ error: 'Non autorise' });
  }
  try {
    const rapport = await envoyerRappels({
      dryRun: req.query.dry === '1',
      // `force=1` reenvoie meme si le rappel a deja ete fait. A n'utiliser que
      // pour tester l'envoi reel : sans lui, la base bloque le doublon.
      force: req.query.force === '1',
    });
    res.json(rapport);
  } catch (err) {
    console.error('[rappels] erreur :', err.message);
    res.status(500).json({ error: 'Echec', detail: err.message });
  }
});

module.exports = router;
