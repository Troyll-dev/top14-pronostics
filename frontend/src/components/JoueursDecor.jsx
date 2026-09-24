import { useLocation } from 'react-router-dom';
import './JoueursDecor.css';

/**
 * Les joueurs, en bandeau et en filigrane.
 *
 * Deux presences, deux portees. Le filigrane accompagne toute l'application :
 * c'est un decor, il se contente d'habiller le fond. Le bandeau, lui, prend
 * de la place et affirme quelque chose ; il est donc reserve aux trois pages
 * ou l'on s'attarde — l'accueil et le classement. Ailleurs, ou l'on vient faire
 * quelque chose de precis, il ne ferait que repousser le contenu. Le vestiaire
 * en est exclu pour une raison supplementaire : la boite des messages a sa
 * propre hauteur, et tout ce qui la precede la repousse hors de l'ecran.
 *
 * Pour changer cela, il n'y a que la constante ci-dessous a modifier.
 *
 * L'image est servie en trois tailles ; le navigateur choisit la plus legere
 * qui convienne a l'ecran.
 */
const PAGES_BANDEAU = ['/', '/classement'];

const SRCSET =
  '/equipe-400.webp 400w, /equipe-600.webp 600w, /equipe-900.webp 900w';

export default function JoueursDecor() {
  const { pathname } = useLocation();
  const avecBandeau = PAGES_BANDEAU.includes(pathname);

  return (
    <>
      {/* Le filigrane : partout, sur toutes les pages de l'application. */}
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
            src="/equipe-600.webp"
            srcSet={SRCSET}
            sizes="(min-width: 704px) 672px, 100vw"
            alt=""
            width={600}
            height={552}
            decoding="async"
          />
        </div>
      )}
    </>
  );
}
