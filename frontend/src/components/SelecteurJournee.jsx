import { useEffect, useRef } from 'react';

/**
 * Le choix de la journee, partout le meme.
 *
 * Il existait en quatre exemplaires — Championnat, Mes pronos, Tous les pronos,
 * et l'onglet Journee du classement — avec le meme defaut dans les quatre :
 * un defilement horizontal a barre masquee. C'est le bon reglage sur telephone,
 * ou l'on pousse du doigt, et le mauvais sur un ecran non tactile : rien
 * n'indique qu'il y a quelque chose a faire defiler, la molette fait defiler la
 * page verticalement, et personne n'atteint la J20 sans connaitre l'astuce du
 * Maj + molette.
 *
 * D'ou la regle d'ici : on defile sur petit ecran, on passe a la ligne des qu'il
 * y a de la place. Vingt-six pastilles tiennent alors sur deux lignes, toutes
 * visibles et cliquables, sans barre ni astuce a connaitre.
 *
 * Et la pastille active est amenee dans le champ au chargement : ouvrir la J18
 * sur un telephone montrait le debut de la liste, donc J1, donc l'impression
 * que rien n'etait selectionne. `block: 'nearest'` est important — sans lui, le
 * navigateur fait aussi defiler la page verticalement pour amener l'element,
 * et la page sauterait a chaque changement de journee.
 */
export default function SelecteurJournee({ rounds, valeur, onChange, className = '' }) {
  const actif = useRef(null);

  useEffect(() => {
    actif.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [valeur]);

  if (!rounds || rounds.length === 0) return null;

  return (
    <div
      className={`flex gap-1.5 pb-1.5 overflow-x-auto scrollbar-none
                  sm:overflow-x-visible sm:flex-wrap ${className}`}
    >
      {rounds.map((r) => {
        const choisie = valeur === r;
        return (
          <button
            key={r}
            ref={choisie ? actif : null}
            onClick={() => onChange(r)}
            aria-current={choisie ? 'true' : undefined}
            className={`shrink-0 font-display text-[13.5px] font-semibold px-3.5 py-1.5 rounded border transition-colors ${
              choisie
                ? 'chip-on'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-amber-500 hover:text-white'
            }`}
          >
            J{r}
          </button>
        );
      })}
    </div>
  );
}
