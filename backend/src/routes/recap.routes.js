const express = require('express');
const router = express.Router();
const { envoyerRecap } = require('../services/recap.service');

/**
 * Le secret ne se lit que dans l'en-tete `x-sync-secret`, jamais dans une URL —
 * un parametre d'adresse se retrouve dans les journaux du serveur, dans
 * l'historique du navigateur et dans l'en-tete `Referer`, et aucune de ces
 * traces ne se reprend.
 */
function autorise(req) {
  const fourni = req.headers['x-sync-secret'];
  const attendu = process.env.SYNC_SECRET;
  if (attendu && fourni === attendu) return true;
  return !!req.user;
}

/**
 * GET|POST /api/recap
 *   ?dry=1      simule : calcule le bilan, n'ecrit rien, n'envoie rien
 *   ?force=1    renvoie meme si le bilan a deja ete envoye
 *   ?round=4    force une journee precise
 *
 * Sert a verifier le contenu un mercredi, sans attendre lundi et sans ecrire a
 * personne. `force` existe pour le jour ou un envoi echoue a mi-parcours.
 */
async function lancer(req, res) {
  if (!autorise(req)) return res.status(401).json({ error: 'Non autorise' });
  try {
    const r = await envoyerRecap({
      dryRun: req.query.dry === '1',
      force: req.query.force === '1',
      round: req.query.round ? parseInt(req.query.round, 10) : null,
    });
    res.json(r);
  } catch (err) {
    console.error('[bilan] erreur :', err.message);
    res.status(500).json({ error: 'Echec du bilan', detail: err.message });
  }
}

router.get('/', lancer);
router.post('/', lancer);

module.exports = router;
