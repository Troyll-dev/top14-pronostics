/**
 * Le bandeau d'une page.
 *
 * Sept pages en portent un — Bienvenue, Accueil, Classement, Mes pronos,
 * Championnat, Résultats, Comptoir — et il n'y en a qu'une implémentation. C'est l'objet de ce fichier : la première
 * version vivait dans WelcomePage, et les autres pages l'auraient recopiée.
 * Quatre copies d'un même réglage, ce sont quatre occasions pour l'une d'elles
 * de dériver sans qu'on s'en aperçoive — un arrondi ici, un dégradé là.
 *
 * Ce que le composant garantit, et qui ne se devine pas en lisant le JSX :
 *
 * Le bas se fond dans la page par un masque en dégradé, pour qu'il n'y ait pas
 * de bord net entre l'image et le fond. Une photo opaque posée sur une page
 * sombre se termine sinon par un trait, et ce trait se voit.
 *
 * Bord à bord sur téléphone, arrondi dès qu'il y a de la place. Une image qui
 * touche les deux côtés de l'écran a de l'ampleur ; la même avec seize pixels
 * de marge de chaque côté a l'air d'avoir raté son cadre.
 *
 * `aspect-ratio` plutôt qu'une hauteur fixe : le cadrage reste identique
 * partout, et surtout la place est réservée avant même que l'image arrive —
 * donc la page ne saute pas quand elle finit de charger.
 *
 * ---------------------------------------------------------------------------
 * LA PROPORTION EST RÉGLABLE, ET ELLE NE L'ÉTAIT PAS
 * ---------------------------------------------------------------------------
 *
 * Le 16/9 était écrit en dur, et c'était défendable : une seule proportion pour
 * toutes les pages, c'est ce qui fait qu'on reconnaît le même bandeau de l'une
 * à l'autre. L'image du Classement avait d'ailleurs été recoupée de 4/3 en 16/9
 * pour cette raison.
 *
 * Ce qui l'a fait céder, c'est « Mes pronos ». Un bandeau y précède la liste des
 * sept matchs, c'est-à-dire la seule page du site où l'on vient pour faire
 * quelque chose et non pour regarder. En 16/9, l'illustration mangeait un bon
 * tiers de l'écran d'un téléphone avant le premier score à saisir — l'ampleur
 * qu'on cherche sur une page d'accueil devient un obstacle sur une page de
 * saisie. Son image étant panoramique, la garder telle quelle règle les deux
 * problèmes d'un coup : rien n'est coupé, et le bandeau fait la moitié de la
 * hauteur.
 *
 * La valeur par défaut reste le 16/9 : les trois autres pages n'ont rien à
 * changer, et une page qui s'écarte de la règle doit le dire explicitement.
 *
 * ---------------------------------------------------------------------------
 *
 * Les photos ne basculent pas avec le thème — c'est assumé, une enseigne
 * éclaire pareil de jour comme de nuit — et ça évite le piège inverse, une
 * image détourée dont les noirs se fondraient dans un fond sombre.
 *
 * La classe `bandeau` n'habille rien : elle sert de repere à `PhotoCopains.css`,
 * qui réserve la place de la vignette des copains en rognant le premier élément
 * de la colonne. Ce premier élément était le titre ; c'est désormais le bandeau,
 * qui se faisait donc rogner à droite d'une centaine de pixels. La feuille de
 * style saute cette réservation sur les pages qui portent un bandeau.
 *
 * `alt=""` et `aria-hidden` : ce sont des illustrations, elles ne portent
 * aucune information. Les décrire à un lecteur d'écran lui ferait perdre du
 * temps avant d'arriver au contenu.
 *
 * ---------------------------------------------------------------------------
 * COLLÉ SOUS LA BARRE SUR TÉLÉPHONE, DÉTACHÉ SUR ÉCRAN LARGE
 * ---------------------------------------------------------------------------
 *
 * Sur téléphone, le bandeau touche les deux bords de l'écran : il se présente
 * comme une bande pleine largeur. Mais toutes les pages s'ouvrent sur une marge
 * haute de vingt-quatre pixels (`py-6`), qui le présentait en même temps comme
 * une carte posée sur le fond — une bande crème entre le liseré orange de la
 * barre et le haut de l'image, qui lui donnait l'air de flotter.
 *
 * `-mt-6` annule cette marge, et le bandeau vient se coller sous la barre : la
 * page s'ouvre sur trois bandes qui s'enchaînent, le vert, le liseré, l'image.
 *
 * Sur écran large (`sm:` et au-delà), il ne touche plus les bords, il a des
 * coins arrondis : c'est réellement une carte, et une carte posée contre une
 * barre n'a pas de sens. `sm:mt-0` lui rend donc sa marge. La règle suit la
 * nature de l'objet — bande d'un bord à l'autre, ou carte au milieu du fond —
 * et pas une préférence de page.
 *
 * La correction a d'abord été faite sur « Mes pronos » seule, en retirant la
 * marge haute de la page. Elle est ici désormais, pour les sept pages d'un
 * coup, et suppose une convention que toutes respectent : **le bandeau est le
 * premier élément d'une colonne en `py-6`**. Une page qui en dérogerait le
 * verrait remonter de vingt-quatre pixels — c'est ce qu'il faut regarder en
 * premier si un bandeau mord un jour sur la barre.
 */
/**
 * ---------------------------------------------------------------------------
 * LA LARGEUR ANNONCÉE AU NAVIGATEUR EST ELLE AUSSI RÉGLABLE
 * ---------------------------------------------------------------------------
 *
 * `sizes` ne décrit pas une mise en page : c'est la promesse faite au
 * navigateur de la largeur que l'image occupera, et il choisit dans `srcSet`
 * d'après cette promesse — avant d'avoir lu la moindre feuille de style. Une
 * promesse fausse se paie donc immédiatement, et dans les deux sens : trop
 * basse, il télécharge une image trop petite et on voit la bouillie ; trop
 * haute, il charge un fichier inutilement lourd.
 *
 * Les trois premières pages tiennent dans une colonne de 768 pixels, d'où la
 * valeur d'origine. « Résultats » est en `max-w-6xl`, soit 1152 : le navigateur
 * y aurait pris l'image de 1008 pour l'étirer sur 1152, c'est-à-dire la seule
 * page du site où le bandeau aurait été flou. La valeur se règle donc par page,
 * et reste à 768 pour toutes celles qui n'en disent rien.
 */
export default function Bandeau({
  nom,
  position = 'center 50%',
  ratio = 16 / 9,
  tailles = '(min-width: 768px) 768px, 100vw',
  className = '',
}) {
  // La hauteur déclarée suit la proportion demandée. Elle ne sert pas à
  // l'affichage — `aspect-ratio` s'en charge — mais à réserver la place avant
  // le chargement : une valeur fausse ici, et la page sauterait quand même.
  const largeur = 1008;
  const hauteur = Math.round(largeur / ratio);

  return (
    <div
      aria-hidden="true"
      className={`bandeau -mx-4 -mt-6 sm:mx-0 sm:mt-0 sm:rounded-xl overflow-hidden ${className}`}
      style={{
        WebkitMaskImage: 'linear-gradient(#000 74%, transparent 100%)',
        maskImage: 'linear-gradient(#000 74%, transparent 100%)',
      }}
    >
      <img
        src={`/${nom}-1008.webp`}
        srcSet={`/${nom}-672.webp 672w, /${nom}-1008.webp 1008w, /${nom}-1344.webp 1344w`}
        sizes={tailles}
        alt=""
        width={largeur}
        height={hauteur}
        decoding="async"
        className="block w-full h-auto object-cover"
        style={{ aspectRatio: String(ratio), objectPosition: position }}
      />
    </div>
  );
}
