import { useLocation } from 'react-router-dom';
import './PhotoCopains.css';

/**
 * La bande de copains, epinglee a cote du titre.
 *
 * Elle n'apparait que sur les deux pages listees dans PAGES : le classement et
 * le vestiaire. Ailleurs, les en-tetes portent deja des pastilles, des
 * selecteurs de journee ou des liens, et la vignette leur disputait la place.
 * Ces deux pages-la sont celles ou l'on regarde les copains plutot que le
 * championnat, donc la photo y est a sa place.
 *
 * Le filtre est ici plutot que dans App.jsx pour que le montage reste d'une
 * seule ligne cote routes, et pour que la regle « ou cette vignette a le droit
 * d'apparaitre » reste avec la vignette. Pour changer la liste, il suffit de
 * modifier PAGES ci-dessous.
 *
 * Deux niveaux : une ancre invisible qui reproduit la geometrie de la colonne
 * de contenu, et la vignette posee a son bord droit. Sans cette ancre, `right`
 * se referait au bord de la fenetre et la vignette partirait dans la marge sur
 * les grands ecrans.
 *
 * Purement decoratif : pas de clic, pas d'agrandissement, pas d'etat.
 *
 * L'image servie est un recadrage sur la bande des visages, entre 12 % et 78 %
 * de la hauteur d'origine. Ce cadrage resserre sur l'essentiel, allege le
 * fichier — 47 ko contre 2,7 Mo pour le PNG de depart — et laisse au passage
 * la signature du coin inferieur droit hors champ, puisqu'elle se trouve a
 * 97 % de la hauteur.
 */
const PAGES = ['/classement', '/chat'];

export default function PhotoCopains() {
  const { pathname } = useLocation();
  if (!PAGES.includes(pathname)) return null;

  return (
    <div className="photo-copains-ancre" aria-hidden="true">
      <div className="photo-copains">
        <img
          src="/copains-vignette.webp"
          alt=""
          width={520}
          height={253}
          loading="lazy"
          decoding="async"
          className="block w-full h-auto rounded-[7px]"
        />
        <span className="photo-copains-legende">La bande</span>
      </div>
    </div>
  );
}
