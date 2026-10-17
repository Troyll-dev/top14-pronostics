import { useCompetition, TOP14, SIX_NATIONS, LIBELLES } from '../contexts/CompetitionContext';

/**
 * « Top 14 | XV de France », en tête de Mes pronos, Résultats et Classement.
 *
 * Deux boutons collés plutôt qu'un menu : il n'y a que deux choix, et les voir
 * tous les deux dit d'un coup qu'un second jeu existe. Le style reprend les
 * pastilles d'onglets du Classement, pour que le geste se reconnaisse.
 *
 * Il ne rend rien tant que le Tournoi n'est pas ouvert à tous (voir
 * `OUVERTURE_TOURNOI`) : les pages restent alors exactement comme avant.
 */
export default function SelecteurCompetition({ className = '' }) {
  const { competition, setCompetition, visible } = useCompetition();
  if (!visible) return null;

  return (
    <div
      role="tablist"
      aria-label="Compétition"
      className={`inline-flex p-1 rounded-full border border-slate-800 bg-slate-900 ${className}`}
    >
      {[TOP14, SIX_NATIONS].map((c) => {
        const actif = c === competition;
        return (
          <button
            key={c}
            role="tab"
            aria-selected={actif}
            onClick={() => setCompetition(c)}
            className={`font-display text-[13.5px] font-semibold px-4 py-1.5 rounded-full transition-colors ${
              actif ? 'chip-accent' : 'text-slate-400 hover:text-white'
            }`}
          >
            {LIBELLES[c].court}
          </button>
        );
      })}
    </div>
  );
}
