import { useLocation } from 'react-router-dom';
import './PhotoCopains.css';

/**
 * La bande de copains, epinglee a cote du titre.
 *
 * Elle n'apparait que sur les pages listees dans PAGES. Ailleurs, les en-tetes
 * portent deja des pastilles, des selecteurs de journee ou des liens, et la
 * vignette leur disputait la place.
 *
 * Elle a longtemps vecu aussi sur le classement, pour la meme raison qu'au
 * vestiaire : ce sont les pages ou l'on regarde les copains plutot que le
 * championnat. Le classement porte desormais un bandeau pleine largeur, et deux
 * photos de la meme bande sur le meme ecran, l'une au-dessus de l'autre, ne
 * disent pas deux fois plus — elles se font concurrence. La vignette cede donc
 * la place au bandeau, qui occupe le meme role en plus grand.
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
const PAGES = ['/chat'];

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
