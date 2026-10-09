import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import './PhotoCopains.css';

/**
 * La bande de copains, epinglee a cote du titre.
 *
 * Elle n'apparait que sur les pages listees dans PAGES : l'accueil, le
 * classement et le Comptoir. Ailleurs — « Mes pronos », « Tous les pronos »,
 * le championnat — les en-tetes portent deja des pastilles, des selecteurs de
 * journee ou des liens, et la vignette leur disputait la place. Ces trois
 * pages-la sont celles ou l'on regarde les copains plutot que le championnat,
 * donc la photo y est a sa place.
 *
 * Le filtre est ici plutot que dans App.jsx pour que le montage reste d'une
 * seule ligne cote routes, et pour que la regle « ou cette vignette a le droit
 * d'apparaitre » reste avec la vignette. Pour changer la liste, il suffit de
 * modifier PAGES ci-dessous.
 *
 * Depuis que l'accueil et le classement portent un bandeau pleine largeur, la
 * vignette se pose dessus plutot qu'a cote du titre : un polaroid epingle sur
 * une photo. C'est voulu — la reservation de place dans PhotoCopains.css est
 * d'ailleurs desactivee sur ces pages-la, pour que le bandeau garde toute sa
 * largeur.
 *
 * Deux niveaux : une ancre invisible qui reproduit la geometrie de la colonne
 * de contenu, et la vignette posee a son bord droit. Sans cette ancre, `right`
 * se referait au bord de la fenetre et la vignette partirait dans la marge sur
 * les grands ecrans.
 *
 * Purement decoratif : pas de clic, pas d'agrandissement, pas d'etat.
 *
 * Les images sont des recadrages sur la bande des visages. Ce cadrage resserre
 * sur l'essentiel et allege le fichier — une quarantaine de ko contre plusieurs
 * mega pour le PNG de depart.
 *
 * Il y en a trois, et laquelle s'affiche est tiree au sort. Le tirage se fait a
 * l'initialisation de l'etat, donc une seule fois par chargement de page : la
 * vignette ne change pas sous les yeux quand on passe de l'accueil au
 * classement, ce qui serait agacant, mais elle change d'une visite a l'autre.
 *
 * Pour en ajouter une autre, il suffit de la deposer dans `public/` et d'ecrire
 * son nom dans IMAGES. Rien d'autre a toucher.
 *
 * Une regle, apprise a la dure sur ces trois-la : **changer l'image en gardant
 * le nom du fichier ne suffit pas toujours**. Un fichier statique deja telecharge
 * sous ce nom reste servi par le navigateur et par le cache de Vercel, qui ne
 * vont pas demander s'il a change — c'est leur travail, et le reste du temps on
 * en est content. Ici ca n'a pas eu lieu, parce que ces trois noms-la n'avaient
 * encore jamais ete demandes : l'ancienne vignette s'appelait
 * `copains-vignette.webp`. Mais au prochain remplacement, ils l'auront ete.
 * Donc : nouvelle photo, nouveau nom, et la serie suivante s'appellera 4, 5
 * et 6.
 */
const PAGES = ['/', '/classement', '/chat'];

const IMAGES = ['/copains-1.webp', '/copains-2.webp', '/copains-3.webp'];

export default function PhotoCopains() {
  const { pathname } = useLocation();

  // Le tirage passe par l'initialiseur de `useState` et non par un appel direct
  // a Math.random dans le rendu : sans cela, chaque rendu rendrait une image
  // differente, et la vignette clignoterait au moindre changement d'etat.
  const [image] = useState(() => IMAGES[Math.floor(Math.random() * IMAGES.length)]);

  if (!PAGES.includes(pathname)) return null;

  return (
    <div className="photo-copains-ancre" aria-hidden="true">
      <div className="photo-copains">
        <img
          src={image}
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
