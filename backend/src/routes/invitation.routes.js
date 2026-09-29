const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const invitations = require('../services/invitation.service');
const mailer = require('../services/mailer.service');

/**
 * Les invitations.
 *
 * Une seule route est ouverte : celle qui lit un jeton. Elle doit l'etre, pour
 * la meme raison que la reinitialisation de mot de passe — on arrive ici depuis
 * un lien recu par courriel, sur un appareil ou l'on n'a evidemment pas de
 * compte. Ce qu'elle rend est volontairement maigre : le prenom de celui qui
 * invite, l'adresse si elle etait connue, et le mot laisse. Rien qui permette
 * de deviner un autre jeton.
 *
 * Toutes les autres exigent d'etre connecte : inviter est reserve a ceux qui
 * sont deja de la bande, et chacun ne voit et n'annule que ses propres
 * invitations.
 */

/**
 * GET /api/invitations/mode — publique.
 *
 * Dit si l'inscription exige une invitation. Sans cette route, la page
 * d'inscription devrait deviner : soit elle bloque toujours faute de jeton — et
 * elle bloquerait a tort le jour ou l'on rouvre les inscriptions —, soit elle
 * laisse remplir un formulaire que le serveur refusera a la fin, ce qui est la
 * pire des deux. Une question posee franchement vaut mieux qu'une hypothese.
 */
router.get('/mode', (req, res) => {
  res.json({ surInvitation: invitations.surInvitation() });
});

/** GET /api/invitations/verifier?jeton=... — publique, en lecture seule. */
router.get('/verifier', async (req, res) => {
  try {
    const etat = await invitations.lire(req.query.jeton);
    if (!etat) return res.status(404).json({ valide: false, raison: 'inconnue' });
    res.json(etat);
  } catch (err) {
    console.error('[invitations] verification :', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/** GET /api/invitations — les miennes. Jamais de jeton dans la reponse. */
router.get('/', authenticate, async (req, res) => {
  try {
    res.json(await invitations.mesInvitations(req.user.id));
  } catch (err) {
    console.error('[invitations] liste :', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * POST /api/invitations   { email?, message?, envoyer? }
 *
 * Rend le lien en clair. C'est la seule et unique fois qu'il sort du serveur :
 * seule son empreinte est stockee, donc il ne pourra pas etre relu plus tard.
 * Perdu, il se remplace en un clic — ce qui vaut mieux qu'un lien valable
 * consultable indefiniment dans une page.
 *
 * Quand l'envoi par courriel echoue, on repond quand meme 201 avec le lien : le
 * lien, lui, est bel et bien cree et fonctionne. Repondre en erreur laisserait
 * croire qu'il n'y a pas d'invitation alors qu'il y en a une, et pousserait a
 * en creer une seconde pour rien. On dit simplement que le courriel n'est pas
 * parti, et celui qui invite colle le lien lui-meme.
 */
router.post('/', authenticate, async (req, res) => {
  const { email, message, envoyer } = req.body || {};

  if (envoyer && !email) {
    return res.status(400).json({ error: 'Pour envoyer l\'invitation, il faut une adresse' });
  }

  try {
    const { invitation, lien } = await invitations.creer({
      invitedById: req.user.id,
      email: email || null,
      message: message || null,
    });

    let envoye = false;
    let soucis = null;

    if (envoyer) {
      if (!mailer.isConfigured()) {
        soucis = 'L\'envoi d\'e-mails n\'est pas configuré — copie le lien à la main.';
      } else {
        try {
          await invitations.envoyer({
            email: invitation.email,
            lien,
            parrain: req.user.username,
            message: invitation.message,
          });
          envoye = true;
        } catch (err) {
          console.error('[invitations] envoi :', err.message);
          soucis = 'Le courriel n\'est pas parti — le lien reste valable, copie-le à la main.';
        }
      }
    }

    res.status(201).json({
      lien,
      envoye,
      soucis,
      email: invitation.email,
      expireLe: invitation.expiresAt,
    });
  } catch (err) {
    if (err.statut) return res.status(err.statut).json({ error: err.message });
    console.error('[invitations] creation :', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/** DELETE /api/invitations/:id — annule une invitation encore en attente. */
router.delete('/:id', authenticate, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Identifiant invalide' });

  try {
    const fait = await invitations.annuler(id, req.user.id);
    if (!fait) {
      return res.status(404).json({ error: 'Invitation introuvable, ou déjà utilisée' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[invitations] annulation :', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
