/**
 * Le bandeau d'une page.
 *
 * Trois pages en portent un — Bienvenue, Accueil, Classement — et il n'y en a
 * qu'une implémentation. C'est l'objet de ce fichier : la première version
 * vivait dans WelcomePage, et les deux autres pages l'auraient recopiée. Trois
 * copies d'un même réglage, ce sont trois occasions pour l'une d'elles de
 * dériver sans qu'on s'en aperçoive — un arrondi ici, un dégradé là.
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
 * donc la page ne saute pas quand elle finit de charger. Les trois images sont
 * découpées en 16/9, y compris celle du Classement qui était à l'origine en
 * 4/3 : une seule proportion pour les trois pages, c'est ce qui fait qu'on
 * reconnaît le même bandeau d'une page à l'autre.
 *
 * Les photos ne basculent pas avec le thème — c'est assumé, une enseigne
 * éclaire pareil de jour comme de nuit — et ça évite le piège inverse, une
 * image détourée dont les noirs se fondraient dans un fond sombre.
 *
 * `alt=""` et `aria-hidden` : ce sont des illustrations, elles ne portent
 * aucune information. Les décrire à un lecteur d'écran lui ferait perdre du
 * temps avant d'arriver au contenu.
 */
export default function Bandeau({ nom, position = 'center 50%', className = '' }) {
  return (
    <div
      aria-hidden="true"
      className={`-mx-4 sm:mx-0 sm:rounded-xl overflow-hidden ${className}`}
      style={{
        WebkitMaskImage: 'linear-gradient(#000 74%, transparent 100%)',
        maskImage: 'linear-gradient(#000 74%, transparent 100%)',
      }}
    >
      <img
        src={`/${nom}-1008.webp`}
        srcSet={`/${nom}-672.webp 672w, /${nom}-1008.webp 1008w, /${nom}-1344.webp 1344w`}
        sizes="(min-width: 768px) 768px, 100vw"
        alt=""
        width={1008}
        height={567}
        decoding="async"
        className="block w-full h-auto object-cover"
        style={{ aspectRatio: '1.78', objectPosition: position }}
      />
    </div>
  );
}
