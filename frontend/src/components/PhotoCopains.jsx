import './PhotoCopains.css';

/**
 * La bande de copains, epinglee a cote du titre de la page.
 *
 * Deux niveaux : une ancre invisible qui reproduit la geometrie de la colonne
 * de contenu, et la vignette posee a son bord droit. Sans cette ancre, `right`
 * se referait au bord de la fenetre et la vignette partirait dans la marge sur
 * les grands ecrans.
 *
 * Purement decoratif : pas de clic, pas d'agrandissement, pas d'etat. Une
 * image et c'est tout.
 *
 * L'image servie est un recadrage sur la bande des visages, entre 12 % et 78 %
 * de la hauteur d'origine. Ce cadrage resserre sur l'essentiel, allege le
 * fichier — 47 ko contre 2,7 Mo pour le PNG de depart — et laisse au passage
 * la signature du coin inferieur droit hors champ, puisqu'elle se trouve a
 * 97 % de la hauteur.
 */
export default function PhotoCopains() {
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
