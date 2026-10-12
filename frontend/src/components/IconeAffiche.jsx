/**
 * Le marqueur de l'affiche de la journée.
 *
 * Une image, déclarée une fois, utilisée partout où l'affiche se montre : les
 * deux endroits de la carte de match, le coin des cellules du tableau
 * « Résultats » et sa légende. Même raisonnement que pour le bouffon du joker —
 * quatre copies d'une même balise `<img>`, ce sont quatre occasions de diverger,
 * un chemin changé ici, une taille oubliée là.
 *
 * ---------------------------------------------------------------------------
 * Pourquoi une image plutôt qu'un emoji
 * ---------------------------------------------------------------------------
 *
 * C'était ⭐, et le défaut n'est pas le choix du symbole : un emoji n'est pas
 * dessiné par le site mais par le système. Il ne ressemblait donc pas à la même
 * chose sur un iPhone, sur Android et sur Windows — et à aucune des deux autres
 * familles d'icônes du site. Pour un symbole qui porte une règle du jeu, « ici
 * les points comptent triple », c'est une mauvaise propriété : la règle doit
 * avoir partout le même visage.
 *
 * ---------------------------------------------------------------------------
 * Les tailles d'usage
 * ---------------------------------------------------------------------------
 *
 * Elles s'alignent sur celles du bouffon, qui ont été mesurées et pas choisies
 * au jugé : 26 pixels dans les cellules du tableau, 22 dans la légende, 20 dans
 * la pastille de l'en-tête, 16 dans la phrase explicative. Les deux symboles
 * disent la même chose — « cette case rapporte plus » — et se présentent donc du
 * même poids.
 *
 * Une étoile dorée portant un ballon en son centre, et il a fallu trois essais
 * pour y arriver.
 *
 * La première version posait un calendrier **à côté** d'une étoile : à 16
 * pixels les deux objets se confondaient en une tache dorée, et le calendrier
 * n'ajoutait aucun sens — ce qui est marqué, c'est l'affiche de la journée, pas
 * une date. La deuxième était une étoile seule : lisible partout, sauf sur la
 * pastille ambre de la carte de match, où l'or sur l'or donnait un contraste
 * de 1,15, autrement dit deux couleurs quasi identiques.
 *
 * Celle-ci règle le contraste sans filtre et sans toucher au fond : le ballon
 * crème fait un cœur clair, la couronne dorée un pourtour, et l'étoile a donc
 * deux valeurs au lieu d'une. C'est ce contraste interne qui la détache de
 * l'ambre.
 *
 * Elle semble contredire la règle vérifiée trois fois sur ce site — deux objets
 * dans une icône ne survivent pas en dessous de 24 pixels — et l'exception
 * s'explique : le second objet n'est pas posé à côté du premier, il est
 * concentrique. La silhouette extérieure reste une étoile pure, donc la forme
 * ne se brouille pas ; seul le remplissage change. À 16 pixels le ballon n'est
 * plus qu'un point clair et le tricolore a disparu, mais l'étoile reste une
 * étoile, et c'était tout l'enjeu.
 *
 * ---------------------------------------------------------------------------
 * Le nom du fichier change avec le dessin
 * ---------------------------------------------------------------------------
 *
 * `affiche-ballon-*` et non `affiche-*`. Les deux versions précédentes ont
 * partagé le même nom, et le navigateur comme le cache de Vercel ont continué
 * de servir l'ancienne image : on a cherché un défaut de déploiement là où il
 * n'y avait qu'un fichier gardé en mémoire. Nouveau dessin, nouveau nom — c'est
 * la règle du projet depuis les bandeaux de septembre.
 *
 * `srcSet` donne la version 96 aux écrans à forte densité : à 26 pixels
 * d'affichage, un téléphone récent en demande 78.
 *
 * `alt=""` : le `title` du parent porte déjà l'explication, et faire lire
 * « image » à un lecteur d'écran avant un score n'aide personne.
 */
export default function IconeAffiche({ taille = 26, className = '' }) {
  return (
    <img
      src="/nav/affiche-ballon-48.webp"
      srcSet="/nav/affiche-ballon-48.webp 48w, /nav/affiche-ballon-96.webp 96w"
      sizes={`${taille}px`}
      alt=""
      width={taille}
      height={taille}
      decoding="async"
      className={`inline-block shrink-0 select-none ${className}`}
      style={{ width: taille, height: taille }}
    />
  );
}
