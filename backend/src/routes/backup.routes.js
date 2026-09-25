const express = require('express');
const router = express.Router();
const { exportAll, exportGzip } = require('../services/backup.service');

/**
 * Telechargement de la sauvegarde.
 *
 * Protegee par le seul SYNC_SECRET, et volontairement pas par « etre
 * connecte » : ce fichier contient les empreintes de mots de passe de tout le
 * monde. Un joueur connecte ne doit pas pouvoir le recuperer.
 *
 * Le secret se passe en en-tete, jamais en parametre d'URL : les URL
 * atterrissent dans les journaux du serveur, dans l'historique du navigateur
 * et dans le presse-papier quand on partage un lien.
 */
function autorise(req) {
  const attendu = process.env.SYNC_SECRET;
  return !!attendu && req.headers['x-sync-secret'] === attendu;
}

router.get('/', async (req, res) => {
  if (!autorise(req)) return res.status(401).json({ error: 'Non autorise' });
  try {
    const avatars = req.query.avatars === '1';
    // Les empreintes de mots de passe ne sortent que sur demande explicite, et
    // jamais dans l'envoi hebdomadaire : ce fichier-la voyage par courriel.
    const passwords = req.query.motsdepasse === '1';
    const jour = new Date().toISOString().slice(0, 10);

    if (req.query.gz === '1') {
      const { buf } = await exportGzip({ avatars, passwords });
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', `attachment; filename="top14-${jour}.json.gz"`);
      return res.send(buf);
    }

    const data = await exportAll({ avatars, passwords });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="top14-${jour}.json"`);
    res.send(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[sauvegarde] echec :', err.message);
    res.status(500).json({ error: 'Echec de la sauvegarde', detail: err.message });
  }
});

module.exports = router;
