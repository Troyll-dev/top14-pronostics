import './JoueursDecor.css';

/**
 * Les joueurs, en filigrane.
 *
 * Ce composant portait aussi un bandeau — la soiree au pub — montre sur
 * l'accueil et le classement. Il a ete retire : chacune de ces deux pages
 * possede desormais son propre bandeau, avec sa propre image, pose par le
 * composant `Bandeau`. Deux mecanismes pour la meme chose, l'un dans le decor
 * global et l'autre dans les pages, donnaient exactement ce qu'on pouvait en
 * attendre : deux bandeaux empiles.
 *
 * Le choix de laisser les pages decider n'est pas qu'une question de doublon.
 * Un bandeau fait partie de ce qu'une page raconte — l'accueil accueille, le
 * classement se feuillette, Halloween passera. Le decor, lui, n'a pas a savoir
 * sur quelle page il se trouve, et la liste de routes qu'il fallait tenir ici
 * disparait avec le bandeau.
 *
 * Reste donc ce qui est vraiment du decor : deux filigranes de joueurs, dans
 * les coins, sur toutes les pages. Ils ne dependent d'aucune route, ce qui est
 * la definition meme d'un fond.
 *
 * Les images sont servies en plusieurs tailles ; le navigateur choisit la plus
 * legere qui convienne a l'ecran. Les deux coins portent deux dessins
 * differents : le meme repete de part et d'autre se remarquerait immediatement.
 *
 * Les fichiers `pub-*.webp` ne servent plus a personne et peuvent etre
 * supprimes de `public/`.
 */

const SRCSET =
  '/equipe-400.webp 400w, /equipe-600.webp 600w, /equipe-900.webp 900w';

const SRCSET_G =
  '/equipe-g-400.webp 400w, /equipe-g-600.webp 600w, /equipe-g-900.webp 900w';

export default function JoueursDecor() {
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
    </>
  );
}
