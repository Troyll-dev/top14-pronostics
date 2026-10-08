/**
 * Le bouffon du joker.
 *
 * Une image, déclarée une fois, utilisée partout où le joker se montre : les
 * pastilles du tableau « Tous les pronos », sa légende, et les trois endroits de
 * la carte de match. L'alternative était de recopier la balise `<img>` à chaque
 * fois ; cinq copies d'une même image, ce sont cinq occasions pour l'une d'elles
 * de dériver — un chemin changé ici, une taille oubliée là.
 *
 * ---------------------------------------------------------------------------
 * Pourquoi une image plutôt qu'un emoji
 * ---------------------------------------------------------------------------
 *
 * C'était 🃏, la carte à jouer. Le problème n'était pas le choix du symbole mais
 * sa densité : à treize pixels, une carte à jouer n'est plus qu'un rectangle
 * blanc moucheté, et deux joueurs sur trois ne voyaient pas qu'il y avait
 * quelque chose. On l'a d'abord agrandi de neuf à treize pixels, ce qui a aidé
 * sans régler l'affaire.
 *
 * Un emoji a aussi un défaut qu'on oublie : il n'est pas dessiné par le site. Il
 * est dessiné par le système, donc il ne ressemble pas à la même chose sur un
 * iPhone, sur Android et sur Windows. Pour un symbole qui porte une règle du
 * jeu — « ici, les points comptent double » — c'est une mauvaise propriété.
 *
 * ---------------------------------------------------------------------------
 * La taille
 * ---------------------------------------------------------------------------
 *
 * Vingt-six pixels, et c'est mesuré, pas choisi au jugé : rendu côte à côte avec
 * l'emoji et avec une silhouette plate, ce dessin-ci commence à se lire vers 26
 * et pas avant. En dessous, le visage, les grelots et le liseré doré se
 * mélangent en une tache violette — un dessin riche coûte des pixels.
 *
 * C'est deux fois la taille de l'ancien symbole, donc les cellules du tableau
 * s'agrandissent pour l'accueillir. C'est assumé : un repère qu'on ne voit pas
 * ne sert à rien, et la place perdue est moins chère que l'information perdue.
 *
 * `srcSet` donne la version 192 aux écrans à forte densité — à 26 pixels
 * d'affichage, un téléphone récent en demande 78. Sans elle, le bouffon serait
 * flou précisément là où on le regarde le plus.
 *
 * `alt=""` : le `title` du parent porte déjà l'explication, et faire lire
 * « image » à un lecteur d'écran avant un score n'aide personne.
 */
export default function IconeJoker({ taille = 26, className = '' }) {
  return (
    <img
      src="/joker-96.webp"
      srcSet="/joker-96.webp 96w, /joker-192.webp 192w"
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
