import { useLocation } from 'react-router-dom';
import './JoueursDecor.css';

/**
 * Les joueurs, en bandeau et en filigrane.
 *
 * Deux presences, deux portees. Le filigrane accompagne toute l'application :
 * c'est un decor, il se contente d'habiller le fond. Le bandeau, lui, prend
 * de la place et affirme quelque chose ; il est donc reserve aux trois pages
 * ou l'on s'attarde — l'accueil, le classement et le vestiaire. Sur « Mes
 * pronos » ou « Tous les pronos », ou l'on vient faire quelque chose de precis,
 * il ne ferait que repousser le contenu.
 *
 * Pour changer cela, il n'y a que la constante ci-dessous a modifier.
 *
 * L'image est servie en trois tailles ; le navigateur choisit la plus legere
 * qui convienne a l'ecran.
 */
const PAGES_BANDEAU = ['/', '/classement'];

const SRCSET =
  '/equipe-400.webp 400w, /equipe-600.webp 600w, /equipe-900.webp 900w';

// Deuxieme groupe : le bandeau et le filigrane de gauche. Le coin droit garde
// l'autre image, sans quoi le meme dessin repete de part et d'autre se
// remarquerait immediatement.
const SRCSET_G =
  '/equipe-g-400.webp 400w, /equipe-g-600.webp 600w, /equipe-g-900.webp 900w';

export default function JoueursDecor() {
  const { pathname } = useLocation();
  const avecBandeau = PAGES_BANDEAU.includes(pathname);

  return (
    <>
      {/* Les filigranes : partout, sur toutes les pages de l'application.
          Celui de gauche disparait sous 900 px, ou les deux se rejoindraient
          au centre. */}
      <div className="joueurs-filigrane-gauche" aria-hidden="true">
        <img
          src="/equipe-g-600.webp"
          srcSet={SRCSET_G}
          sizes="52vw"
          alt=""
          loading="lazy"
          decoding="async"
        />
      </div>

      <div className="joueurs-filigrane" aria-hidden="true">
        <img
          src="/equipe-600.webp"
          srcSet={SRCSET}
          sizes="52vw"
          alt=""
          loading="lazy"
          decoding="async"
        />
      </div>

      {avecBandeau && (
        <div className="joueurs-bandeau" aria-hidden="true">
          <img
            src="/equipe-g-600.webp"
            srcSet={SRCSET_G}
            sizes="(min-width: 704px) 672px, 100vw"
            alt=""
            width={600}
            height={556}
            decoding="async"
          />
        </div>
      )}
    </>
  );
}
