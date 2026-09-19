import { useState, useEffect } from 'react';

/**
 * Le statut LIVE existe en base mais personne ne l'ecrit : la synchronisation
 * ne sait passer un match qu'en FINISHED. Un match en train de se jouer reste
 * donc SCHEDULED avec un coup d'envoi deja passe. On deduit l'etat reel a
 * l'affichage, a partir de l'heure.
 *
 * Une rencontre de rugby dure environ deux heures avec la mi-temps et les
 * arrets de jeu ; on retient 2 h 30 pour ne pas basculer trop tot.
 */
export const LIVE_WINDOW_MS = 2.5 * 60 * 60 * 1000;

export function matchState(match, now = Date.now()) {
  if (!match) return 'avenir';
  if (match.status === 'FINISHED') return 'termine';
  if (match.status === 'POSTPONED') return 'reporte';

  const kickoff = new Date(match.kickoff).getTime();
  if (now < kickoff) return 'avenir';
  if (now < kickoff + LIVE_WINDOW_MS) return 'encours';
  // Commence il y a longtemps mais toujours pas de score : la synchro n'a pas
  // encore recupere le resultat.
  return 'attente';
}

export const STATE = {
  avenir:  { label: 'À venir',          short: 'À venir'  },
  encours: { label: 'En cours',         short: 'En cours' },
  termine: { label: 'Terminé',          short: 'Terminé'  },
  attente: { label: 'Score en attente', short: 'En attente' },
  reporte: { label: 'Reporté',          short: 'Reporté'  },
};

/** Classes de la pastille d'etat, coherentes avec le theme. */
export const STATE_CHIP = {
  avenir:  'bg-slate-800/60 text-slate-400 border border-slate-700',
  encours: 'chip-accent',
  termine: 'bg-green-500/20 text-green-400 border border-green-500/40',
  attente: 'bg-slate-800/60 text-slate-500 border border-slate-800',
  reporte: 'bg-slate-800/60 text-slate-500 border border-slate-800',
};

/** Horloge partagee : fait basculer « à venir » en « en cours » sans rechargement. */
export function useNow(intervalMs = 60000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
