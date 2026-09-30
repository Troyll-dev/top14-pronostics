/**
 * Qui a le droit d'administrer.
 *
 * Le constat qui a motive ce fichier : `/api/matches` en creation et
 * `PATCH /api/matches/:id/result` n'exigeaient qu'une authentification, la meme
 * que pour poser un pronostic. N'importe lequel des joueurs pouvait donc saisir
 * le resultat d'une rencontre — et `updateResult` appelle `calculatePoints`,
 * qui distribue les points de tout le monde. Ce n'etait pas un probleme de
 * confidentialite mais d'integrite du jeu : quelqu'un pouvait decider des
 * points, y compris des siens.
 *
 * ---------------------------------------------------------------------------
 * Pourquoi une variable d'environnement et non une colonne
 * ---------------------------------------------------------------------------
 *
 * Un champ `isAdmin` sur le modele serait plus conventionnel. Il demande une
 * colonne, une migration et une mise a jour — trois manipulations sur la base
 * de production pour une liste qui contient une adresse et n'en contiendra
 * probablement jamais deux. La variable se pose en dix secondes et se modifie
 * sans redeployer.
 *
 * Le jour ou cette liste devient longue ou ou l'on veut des droits plus fins,
 * la colonne redeviendra le bon choix — et ce fichier sera le seul a changer.
 *
 * ---------------------------------------------------------------------------
 * Ferme par defaut
 * ---------------------------------------------------------------------------
 *
 * Sans `ADMIN_EMAILS`, personne ne passe. C'est delibere et c'est le seul
 * reglage acceptable pour une porte : un oubli de variable doit fermer, jamais
 * ouvrir. Si la page d'administration cesse de fonctionner apres un
 * deploiement, on saura pourquoi — le serveur le dit au demarrage.
 */

/** La liste des adresses autorisees, normalisees. */
function adresses() {
  return String(process.env.ADMIN_EMAILS || '')
    .split(/[,;\s]+/)
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
}

/** Cet utilisateur administre-t-il ? Tolere un utilisateur absent. */
function estAdmin(user) {
  const liste = adresses();
  if (!liste.length) return false;
  return liste.includes(String(user?.email || '').trim().toLowerCase());
}

/**
 * A poser APRES `authenticate`, jamais a sa place : il lit `req.user`, que seul
 * `authenticate` renseigne. Sans lui, `req.user` est indefini et tout le monde
 * se ferait refuser — ce qui est le bon sens de l'erreur, mais pour la mauvaise
 * raison.
 */
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Non authentifie' });
  if (!estAdmin(req.user)) {
    // On ne dit pas « tu n'es pas administrateur » avec plus de details : la
    // reponse n'apprend rien sur qui l'est.
    return res.status(403).json({ error: 'Reserve a l administration' });
  }
  next();
}

/** Pour l'annonce au demarrage. */
function combien() {
  return adresses().length;
}

module.exports = { requireAdmin, estAdmin, combien };
