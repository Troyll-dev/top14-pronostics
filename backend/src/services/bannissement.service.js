const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Les adresses bannies.
 *
 * ---------------------------------------------------------------------------
 * CE QUE BANNIR VEUT DIRE, ET CE QUE CA NE VEUT PAS DIRE
 * ---------------------------------------------------------------------------
 *
 * Bannir une adresse ferme l'inscription, rien d'autre. Un compte qui existe
 * deja n'est pas touche : pour celui-la il y a la mise en pause, qui le sort du
 * jeu sans rien effacer, et la suppression, qui efface tout. Les trois gestes
 * repondent a trois questions differentes, et les melanger aurait donne un
 * bouton qui fait trop de choses pour qu'on ose l'utiliser.
 *
 * L'ordre habituel sera donc : on supprime le compte de l'indesirable, et on
 * bannit son adresse dans le meme mouvement pour qu'il ne revienne pas se
 * reinscrire dans la minute. C'est pour ca que l'ecran propose les deux
 * ensemble.
 *
 * ---------------------------------------------------------------------------
 * POURQUOI UNE CLE NORMALISEE A COTE DE L'ADRESSE
 * ---------------------------------------------------------------------------
 *
 * Comparer deux adresses caractere par caractere ne marche pas. `Jean@Gmail.com`
 * et `jean@gmail.com` sont la meme boite, et surtout, chez Gmail,
 * `jean.dupont+rugby@gmail.com` arrive aussi dans la boite de `jeandupont@`.
 * Quelqu'un dont on vient de bannir l'adresse se reinscrirait le lendemain avec
 * un point de plus, et le bannissement n'aurait servi qu'a se rassurer.
 *
 * On range donc deux colonnes : `email`, l'adresse telle qu'elle a ete saisie,
 * pour l'afficher a l'administrateur — c'est celle qu'il reconnait —, et `cle`,
 * sa forme normalisee, sur laquelle porte la comparaison et l'unicite.
 *
 * La normalisation reste volontairement modeste : minuscules et espaces pour
 * tout le monde, et chez Gmail seulement les points et le `+suffixe` retires.
 * Appliquer la regle des points a tous les domaines serait faux — beaucoup les
 * traitent comme des caracteres ordinaires, et on bloquerait alors deux
 * personnes differentes.
 *
 * Ce que ca n'arrete pas, et il faut le savoir : rien n'empeche quelqu'un de
 * creer une adresse neuve. Un bannissement entre amis n'est pas un pare-feu,
 * c'est une porte fermee a clef — elle arrete celui qui passait, pas celui qui
 * veut absolument entrer. Le jour ou il faudra plus, c'est la validation des
 * inscriptions par l'administrateur qu'il faudra sortir du tiroir.
 */

const DOMAINES_SANS_POINTS = ['gmail.com', 'googlemail.com'];

/** La forme normalisee d'une adresse, celle sur laquelle on compare. */
function cle(email) {
  const brut = String(email || '').trim().toLowerCase();
  const at = brut.lastIndexOf('@');
  if (at <= 0) return brut;

  let local = brut.slice(0, at);
  const domaine = brut.slice(at + 1);

  // Le `+suffixe` est une convention repandue, pas une regle universelle : on
  // ne la retire que la ou elle est officielle, comme les points.
  if (DOMAINES_SANS_POINTS.includes(domaine)) {
    local = local.split('+')[0].split('.').join('');
  }

  return `${local}@${domaine}`;
}

/** Cette adresse est-elle bannie ? Rend l'enregistrement, ou null. */
async function bannie(email) {
  const k = cle(email);
  if (!k) return null;
  return prisma.adresseBannie.findUnique({ where: { cle: k } });
}

/**
 * Bannir une adresse.
 *
 * Idempotent : bannir deux fois la meme adresse met simplement a jour le motif
 * et la date. L'administrateur n'a pas a se demander si c'etait deja fait, et
 * l'ecran n'a pas a gerer une erreur qui ne signale aucun probleme.
 */
async function bannir(email, { motif = null, par = null } = {}) {
  const k = cle(email);
  if (!k) throw new Error('Adresse vide');

  return prisma.adresseBannie.upsert({
    where: { cle: k },
    update: { email: String(email).trim(), motif, parEmail: par },
    create: { cle: k, email: String(email).trim(), motif, parEmail: par },
  });
}

/** Lever un bannissement. Rend `false` si l'identifiant n'existait pas. */
async function lever(id) {
  try {
    await prisma.adresseBannie.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

/** La liste, de la plus recente a la plus ancienne. */
async function liste() {
  return prisma.adresseBannie.findMany({ orderBy: { createdAt: 'desc' } });
}

module.exports = { cle, bannie, bannir, lever, liste };
