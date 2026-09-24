import { useLocation } from 'react-router-dom';
import './JoueursDecor.css';

/**
 * Les joueurs, en bandeau et en filigrane.
 *
 * Trois pages seulement : l'accueil, le classement et le vestiaire. Ailleurs
 * les en-tetes portent deja des selecteurs de journee ou des pastilles, et
 * l'image leur disputerait la place. Pour changer la liste, il suffit de
 * modifier PAGES ci-dessous.
 *
 * L'image est servie en trois tailles ; le navigateur choisit la plus legere
 * qui convienne a l'ecran. La plus petite fait 69 ko, contre 2,7 Mo pour le
 * fichier d'origine.
 */
const PAGES = ['/', '/classement', '/chat'];

const SRCSET =
  '/equipe-400.webp 400w, /equipe-600.webp 600w, /equipe-900.webp 900w';

export default function JoueursDecor() {
  const { pathname } = useLocation();
  if (!PAGES.includes(pathname)) return null;

  return (
    <>
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

      <div className="joueurs-bandeau" aria-hidden="true">
        <img
          src="/equipe-600.webp"
          srcSet={SRCSET}
          sizes="(min-width: 704px) 672px, 100vw"
          alt=""
          width={600}
          height={575}
          decoding="async"
        />
      </div>
    </>
  );
}
