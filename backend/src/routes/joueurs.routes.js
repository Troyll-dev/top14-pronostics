const router = require('express').Router();
const {
  liste, consequences, pause, supprimer,
  bannissements, bannirAdresse, leverBannissement,
} = require('../controllers/joueurs.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/admin.middleware');

/**
 * La gestion des joueurs, reservee aux administrateurs.
 *
 * Les deux verrous sont poses une fois pour toutes les routes du fichier, comme
 * pour la sante : les oublier sur une seule suffirait a exposer la liste des
 * adresses de tout le monde, et une porte qu'on referme route par route finit
 * toujours par rester ouverte quelque part.
 *
 * L'ordre n'est pas negociable : `authenticate` renseigne `req.user`, dont
 * `requireAdmin` a besoin pour savoir qui frappe.
 */
router.use(authenticate, requireAdmin);

/*
 * Les bannissements avant `/:id`, et ce n'est pas un detail de style.
 *
 * Express essaie les routes dans l'ordre de declaration : `/bannissements`
 * placee apres `/:id/...` serait comprise comme un identifiant de joueur valant
 * la chaine « bannissements ». On ne verrait pas une erreur franche mais un
 * 400 incomprehensible, ce qui est pire.
 */
router.get('/bannissements', bannissements);
router.post('/bannissements', bannirAdresse);
router.delete('/bannissements/:id', leverBannissement);

router.get('/', liste);
router.get('/:id/consequences', consequences);
router.patch('/:id/pause', pause);
router.delete('/:id', supprimer);

module.exports = router;
