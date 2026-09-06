import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import MatchCard from '../components/MatchCard';

export default function MatchesPage() {
  const [rounds, setRounds] = useState([]);
  const [currentRound, setCurrentRound] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/matches/rounds').then((res) => {
      const r = res.data;
      setRounds(r);
      // Sélectionner la journée en cours / la plus proche
      const now = new Date();
      setCurrentRound(r[0] ?? 1);
    });
  }, []);

  const fetchMatches = useCallback(() => {
    if (!currentRound) return;
    setLoading(true);
    api.get(`/matches?round=${currentRound}`)
      .then((res) => setMatches(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [currentRound]);

  useEffect(() => { fetchMatches(); }, [fetchMatches]);

  const hasPrediction = (m) => m.predictions?.length > 0;
  const pending = matches.filter((m) => m.status === 'SCHEDULED' && !hasPrediction(m) && new Date() < new Date(m.kickoff));

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Pronostics</h1>
        {pending.length > 0 && (
          <span className="bg-amber-500 text-black text-xs font-bold px-2 py-1 rounded-full">
            {pending.length} à faire
          </span>
        )}
      </div>

      {/* Sélecteur de journée */}
      {rounds.length > 0 && (
        <div className="flex gap-1 overflow-x-auto pb-2 mb-6 scrollbar-none">
          {rounds.map((r) => (
            <button
              key={r}
              onClick={() => setCurrentRound(r)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                currentRound === r
                  ? 'bg-amber-500 text-black'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              J{r}
            </button>
          ))}
        </div>
      )}

      {/* Liste des matchs */}
      {loading ? (
        <div className="text-center py-16 text-slate-500 animate-pulse">Chargement des matchs...</div>
      ) : matches.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-500 text-lg mb-2">Aucun match pour la journée {currentRound}</p>
          <p className="text-slate-600 text-sm">Les matchs seront ajoutés prochainement</p>
        </div>
      ) : (
        <div className="space-y-3">
          {matches.map((match) => (
            <MatchCard key={match.id} match={match} onPredictionSaved={fetchMatches} />
          ))}
        </div>
      )}

      {/* Récapitulatif journée */}
      {!loading && matches.length > 0 && (
        <div className="mt-6 card bg-slate-900/50">
          <h3 className="font-semibold mb-3 text-sm text-slate-400 uppercase tracking-wide">Journée {currentRound}</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-amber-400">{matches.filter(hasPrediction).length}/{matches.length}</p>
              <p className="text-xs text-slate-500 mt-0.5">Pronostics</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-400">
                {matches.filter((m) => m.status === 'FINISHED').reduce((sum, m) => sum + (m.predictions?.[0]?.points || 0), 0)}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">Points gagnés</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-400">
                {matches.filter((m) => m.status === 'FINISHED' && m.predictions?.[0]?.points === 3).length}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">Scores exacts</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
