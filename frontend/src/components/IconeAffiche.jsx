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
 * Une étoile seule, et c'est le point qui a demandé un essai. La première
 * version posait un calendrier **et** une étoile dans le même cadre : à 16
 * pixels, les deux objets se confondaient en une tache dorée dont on ne
 * distinguait plus rien, et il ne restait que la couleur pour la reconnaître.
 * C'est la règle qu'on a vérifiée trois fois sur ce site — deux objets dans une
 * icône ne survivent pas en dessous de 24 pixels.
 *
 * Le calendrier n'ajoutait d'ailleurs aucun sens : ce qui est marqué, c'est
 * l'affiche de la journée, pas une date.
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
      src="/nav/affiche-48.webp"
      srcSet="/nav/affiche-48.webp 48w, /nav/affiche-96.webp 96w"
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
