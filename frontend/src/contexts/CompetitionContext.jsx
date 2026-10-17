import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';

/**
 * La compétition affichée : le championnat ou le Tournoi.
 *
 * Elle est partagée par les trois pages qui en dépendent — Mes pronos,
 * Résultats, Classement — pour qu'on n'ait pas à la rechoisir à chaque page :
 * qui passe sur « XV de France » pour poser ses pronos veut voir les résultats
 * du Tournoi en cliquant sur « Résultats », pas ceux de la J14.
 *
 * Elle est retenue dans le navigateur, comme les brouillons. Si le stockage est
 * indisponible, on repart simplement du Top 14.
 */

export const TOP14 = 'TOP14';
export const SIX_NATIONS = 'SIX_NATIONS';

/** Ce que chaque compétition affiche en sous-titre, page par page. */
export const LIBELLES = {
  [TOP14]: { court: 'Top 14', saison: 'Saison 2026-2027', nom: 'Championnat de France' },
  // « Édition 2027 » et non « Tournoi 2027 » : le sous-titre se lit
  // « saison · nom », et le mot Tournoi y figurait deux fois.
  [SIX_NATIONS]: { court: 'XV de France', saison: 'Édition 2027', nom: 'Tournoi des Six Nations' },
};

/**
 * À partir de quand tout le monde voit le sélecteur.
 *
 * Le Tournoi est en base dès maintenant, et il se règle pendant l'hiver. Mais
 * l'annonce aux copains est prévue à la mi-janvier : d'ici là, seuls les
 * administrateurs voient le sélecteur, ce qui permet de tout vérifier en
 * production sans rien dévoiler. Pour avancer ou reculer l'ouverture, il suffit
 * de changer cette date.
 */
export const OUVERTURE_TOURNOI = new Date('2027-01-15T00:00:00+01:00');

const CLE = 't14-competition';

function lireStockage() {
  try {
    const v = localStorage.getItem(CLE);
    return v === SIX_NATIONS ? SIX_NATIONS : TOP14;
  } catch {
    return TOP14;
  }
}

const CompetitionContext = createContext({
  competition: TOP14,
  setCompetition: () => {},
  visible: false,
});

export function CompetitionProvider({ children }) {
  const { user } = useAuth();
  const [choix, setChoix] = useState(lireStockage);

  const visible = !!user?.admin || Date.now() >= OUVERTURE_TOURNOI.getTime();

  // Tant que le sélecteur est caché, on reste sur le championnat, quel que
  // soit le choix retenu : un choix fait par un administrateur sur un appareil
  // partagé ne doit pas basculer un autre joueur sur un Tournoi qu'il ne voit
  // pas encore.
  const competition = visible ? choix : TOP14;

  useEffect(() => {
    try { localStorage.setItem(CLE, choix); } catch { /* stockage indisponible */ }
  }, [choix]);

  const valeur = useMemo(
    () => ({ competition, setCompetition: setChoix, visible }),
    [competition, visible],
  );

  return <CompetitionContext.Provider value={valeur}>{children}</CompetitionContext.Provider>;
}

export function useCompetition() {
  return useContext(CompetitionContext);
}
