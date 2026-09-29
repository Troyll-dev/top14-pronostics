import { useState } from 'react';

/**
 * Un champ de mot de passe, avec l'oeil qui l'affiche en clair.
 *
 * Pourquoi celui-ci plutot qu'un second champ « repete ton mot de passe ».
 *
 * Les deux protegent de la meme chose : une faute de frappe qui enfermerait
 * quelqu'un dehors. Mais taper deux fois ne prouve rien sur ce qu'on a tape —
 * on peut se tromper deux fois de la meme facon, et le plus souvent on colle la
 * seconde depuis la premiere. Voir ce qu'on a ecrit, si. Et ca coute un clic
 * facultatif au lieu d'un champ obligatoire de plus, au moment precis ou l'on
 * decide si l'on s'inscrit ou si l'on referme l'onglet.
 *
 * Le masquage revient des que le champ perd le focus. Un mot de passe affiche
 * en clair qui le reste pendant qu'on va chercher son telephone, ou qu'on
 * partage son ecran, est exactement ce qu'on veut eviter — et personne ne pense
 * a re-cliquer sur l'oeil.
 *
 * Le bouton porte `tabIndex={-1}` : au clavier, la tabulation doit mener du mot
 * de passe au bouton d'envoi, pas a une commande d'affichage. Il reste
 * accessible a la souris, et son `aria-label` dit son etat aux lecteurs
 * d'ecran.
 */
export default function ChampMotDePasse({
  className = 'input',
  ...props
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        onBlur={(e) => {
          setVisible(false);
          props.onBlur?.(e);
        }}
        className={`${className} pr-11`}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        title={visible ? 'Masquer' : 'Afficher'}
        className="absolute right-0 top-0 h-full px-3 flex items-center
                   text-slate-500 hover:text-amber-500 transition-colors"
      >
        {visible ? (
          /* Oeil barre : ce qu'on obtient en cliquant, donc « masquer ». */
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
