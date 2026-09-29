import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Le choix de la journee, partout le meme.
 *
 * Il existait en quatre exemplaires — Championnat, Mes pronos, Tous les pronos,
 * et l'onglet Journee du classement — avec le meme defaut dans les quatre : un
 * defilement horizontal a barre masquee. C'est le bon reglage sur telephone, ou
 * l'on pousse du doigt, et le mauvais sur un ecran non tactile : rien n'indique
 * qu'il y a quelque chose a faire defiler, la molette fait defiler la page
 * verticalement, et personne n'atteint la J20 sans connaitre l'astuce du
 * Maj + molette.
 *
 * Deux fleches, donc, plutot qu'un passage a la ligne. Le passage a la ligne
 * avait ete essaye et rendait une seconde rangee plus courte et desalignee, qui
 * ressemblait a un debordement plutot qu'a une mise en page — et il faisait
 * grandir le bloc en hauteur au fil de la saison, repoussant le contenu de la
 * page un peu plus chaque mois.
 *
 * Les fleches ne s'affichent que lorsqu'elles servent : rien a faire defiler,
 * pas de fleches. Et chacune se desactive des qu'on touche son bout de piste,
 * ce qui dit ou l'on en est sans avoir besoin d'une barre.
 */
export default function SelecteurJournee({ rounds, valeur, onChange, className = '' }) {
  const piste = useRef(null);
  const actif = useRef(null);
  const [bornes, setBornes] = useState({ gauche: false, droite: false });

  /**
   * Peut-on encore aller a gauche, a droite ?
   *
   * La marge de deux pixels n'est pas une coquetterie : `scrollLeft` peut valoir
   * 0,4 apres un defilement doux, et un test strict laisserait alors une fleche
   * active qui ne fait plus rien. Deux pixels de tolerance evitent ce bouton
   * mort au bout de la piste.
   */
  const mesurer = useCallback(() => {
    const el = piste.current;
    if (!el) return;
    setBornes({
      gauche: el.scrollLeft > 2,
      droite: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
    });
  }, []);

  useEffect(() => {
    mesurer();
    const el = piste.current;
    if (!el) return;
    el.addEventListener('scroll', mesurer, { passive: true });
    window.addEventListener('resize', mesurer);
    return () => {
      el.removeEventListener('scroll', mesurer);
      window.removeEventListener('resize', mesurer);
    };
  }, [mesurer, rounds]);

  /**
   * La pastille choisie est amenee dans le champ.
   *
   * Ouvrir la J18 montrait le debut de la liste, donc J1, donc l'impression que
   * rien n'etait selectionne. `block: 'nearest'` est important : sans lui, le
   * navigateur fait aussi defiler la page verticalement pour amener l'element,
   * et la page sauterait a chaque changement de journee.
   */
  useEffect(() => {
    actif.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
    mesurer();
  }, [valeur, mesurer]);

  const glisser = (sens) => {
    const el = piste.current;
    if (!el) return;
    // Quatre cinquiemes de la largeur visible : on garde une pastille ou deux en
    // commun entre les deux vues, sans quoi on perd le fil de la ou l'on etait.
    el.scrollBy({ left: sens * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  if (!rounds || rounds.length === 0) return null;

  const fleche = 'flex-none w-8 h-8 rounded-md border border-slate-800 bg-slate-900 ' +
    'text-slate-400 font-display leading-none transition-colors ' +
    'hover:border-amber-500 hover:text-white ' +
    'disabled:opacity-30 disabled:hover:border-slate-800 disabled:hover:text-slate-400 ' +
    'disabled:cursor-default';

  const avecFleches = bornes.gauche || bornes.droite;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {avecFleches && (
        <button
          type="button"
          onClick={() => glisser(-1)}
          disabled={!bornes.gauche}
          aria-label="Journées précédentes"
          className={fleche}
        >
          ‹
        </button>
      )}

      <div ref={piste} className="flex gap-1.5 overflow-x-auto scrollbar-none py-0.5">
        {rounds.map((r) => {
          const choisie = valeur === r;
          return (
            <button
              key={r}
              type="button"
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

      {avecFleches && (
        <button
          type="button"
          onClick={() => glisser(1)}
          disabled={!bornes.droite}
          aria-label="Journées suivantes"
          className={fleche}
        >
          ›
        </button>
      )}
    </div>
  );
}
