import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import MatchCard from '../components/MatchCard';

export default function MatchesPage() {
  const [rounds, setRounds] = useState([]);
  const [currentRound, setCurrentRound] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/matches/rounds').then((res) => {
      setRounds(res.data);
    });
    api.get('/matches/next-round').then((res) => {
      setCurrentRound(res.data.round);
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
  const pending = matches.filter(
    (m) => m.status === 'SCHEDULED' && !hasPrediction(m) && new Date() < new Date(m.kickoff)
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h1 className="font-display text-[26px] font-extrabold leading-none">
          Journée <span className="text-amber-500">{currentRound ?? '—'}</span>
        </h1>
        <div className="flex items-center gap-3">
          {pending.length > 0 && (
            <span className="font-display text-xs font-bold chip-accent px-2.5 py-1 rounded whitespace-nowrap">
              {pending.length} à faire
            </span>
          )}
          <Link to="/pronos" className="text-sm text-slate-500 hover:text-amber-500 transition-colors whitespace-nowrap">
            Tous les pronos →
          </Link>
        </div>
      </div>
      <p className="text-xs italic text-slate-500 mb-5">Saison 2026-2027 · Championnat de France</p>

      {/* Sélecteur de journée */}
      {rounds.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1.5 mb-5 scrollbar-none">
          {rounds.map((r) => (
            <button
              key={r}
              onClick={() => setCurrentRound(r)}
              className={`shrink-0 font-display text-[13.5px] font-semibold px-3.5 py-1.5 rounded border transition-colors ${
                currentRound === r
                  ? 'chip-on'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-amber-500 hover:text-white'
              }`}
            >
              J{r}
            </button>
          ))}
        </div>
      )}

      {/* Liste des matchs */}
      {loading ? (
        <div className="text-center py-16 text-slate-500 animate-pulse">Chargement des matchs…</div>
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

      {/* Récapitulatif */}
      {!loading && matches.length > 0 && (
        <div className="card mt-6">
          <h3 className="rule-label mb-4">Récapitulatif</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="font-display text-[27px] font-extrabold leading-none tabular-nums text-amber-500">
                {matches.filter(hasPrediction).length}/{matches.length}
              </p>
              <p className="text-[10.5px] uppercase tracking-wide text-slate-500 mt-1.5">Pronostics</p>
            </div>
            <div>
              <p className="font-display text-[27px] font-extrabold leading-none tabular-nums text-green-400">
                {matches
                  .filter((m) => m.status === 'FINISHED')
                  .reduce((sum, m) => sum + (m.predictions?.[0]?.points || 0), 0)}
              </p>
              <p className="text-[10.5px] uppercase tracking-wide text-slate-500 mt-1.5">Points</p>
            </div>
            <div>
              <p className="font-display text-[27px] font-extrabold leading-none tabular-nums text-blue-400">
                {matches.filter((m) => m.status === 'FINISHED' && m.predictions?.[0]?.points === 3).length}
              </p>
              <p className="text-[10.5px] uppercase tracking-wide text-slate-500 mt-1.5">Scores exacts</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
