import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';

// Couleur de fond d'une case selon les points obtenus
function cellClass(points) {
  if (points === null || points === undefined) return 'bg-slate-800/50 text-slate-300';
  return {
    3: 'bg-green-500/25 text-green-300 font-bold',
    2: 'bg-blue-500/25 text-blue-300 font-semibold',
    1: 'bg-slate-500/25 text-slate-300',
    0: 'bg-red-900/30 text-red-300/70',
  }[points] || 'bg-red-900/30 text-red-300/70';
}

export default function RoundPredictionsPage() {
  const { user } = useAuth();
  const [rounds, setRounds] = useState([]);
  const [currentRound, setCurrentRound] = useState(null);
  const [matches, setMatches] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/matches/rounds').then((res) => setRounds(res.data)).catch(console.error);
    api.get('/matches/next-round')
      .then((res) => setCurrentRound(res.data.round))
      .catch(() => setCurrentRound(1));
  }, []);

  useEffect(() => {
    if (!currentRound) return;
    setLoading(true);
    Promise.all([
      api.get(`/matches?round=${currentRound}`),
      api.get(`/predictions/round/${currentRound}`),
    ])
      .then(([m, p]) => {
        setMatches(m.data);
        setPredictions(p.data.predictions || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [currentRound]);

  // Liste des joueurs ayant pronostiqué sur cette journée
  const playersById = {};
  for (const p of predictions) {
    if (!playersById[p.user.id]) {
      playersById[p.user.id] = { ...p.user, points: 0, count: 0 };
    }
    playersById[p.user.id].count++;
    if (typeof p.points === 'number') playersById[p.user.id].points += p.points;
  }
  const players = Object.values(playersById).sort(
    (a, b) => b.points - a.points || a.username.localeCompare(b.username)
  );

  // Index (userId, matchId) -> pronostic
  const byUserMatch = {};
  for (const p of predictions) byUserMatch[`${p.user.id}-${p.matchId}`] = p;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Pronos de tous les joueurs</h1>
        <Link to="/" className="text-sm text-slate-400 hover:text-amber-400 transition-colors">
          ← Mes pronos
        </Link>
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

      {loading ? (
        <div className="text-center py-16 text-slate-500 animate-pulse">Chargement...</div>
      ) : players.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-500 text-lg mb-2">Aucun pronostic pour la journée {currentRound}</p>
          <p className="text-slate-600 text-sm">Les pronos s'afficheront ici dès que les joueurs auront misé</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 bg-slate-950 text-left font-semibold text-slate-400 px-2 py-2 min-w-[7rem]">
                    Joueur
                  </th>
                  {matches.map((m) => (
                    <th key={m.id} className="px-1.5 py-2 min-w-[4.5rem] align-bottom">
                      <div className="text-[11px] leading-tight text-slate-400 font-semibold">
                        {m.homeTeam.shortName}
                        <span className="text-slate-600"> – </span>
                        {m.awayTeam.shortName}
                      </div>
                      <div className="text-[11px] mt-0.5 font-bold">
                        {m.status === 'FINISHED' ? (
                          <span className="text-white">{m.homeScore}–{m.awayScore}</span>
                        ) : (
                          <span className="text-slate-600">à venir</span>
                        )}
                      </div>
                    </th>
                  ))}
                  <th className="px-2 py-2 text-right font-semibold text-slate-400 min-w-[3.5rem]">Pts</th>
                </tr>
              </thead>
              <tbody>
                {players.map((pl) => {
                  const isMe = pl.id === user?.id;
                  return (
                    <tr key={pl.id}>
                      <td
                        className={`sticky left-0 z-10 px-2 py-1.5 ${
                          isMe ? 'bg-amber-500/10' : 'bg-slate-950'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: pl.avatarColor }}
                          />
                          <span className={`truncate ${isMe ? 'text-amber-400 font-semibold' : 'text-slate-200'}`}>
                            {pl.username}
                          </span>
                        </div>
                      </td>

                      {matches.map((m) => {
                        const p = byUserMatch[`${pl.id}-${m.id}`];
                        return (
                          <td key={m.id} className="px-0.5 py-0.5">
                            <div
                              className={`rounded-md py-1.5 text-center tabular-nums text-xs ${
                                p ? cellClass(p.points) : 'bg-slate-900/60 text-slate-700'
                              }`}
                            >
                              {p ? `${p.homeScorePred}–${p.awayScorePred}` : '—'}
                            </div>
                          </td>
                        );
                      })}

                      <td className={`px-2 py-1.5 text-right font-bold tabular-nums ${
                        isMe ? 'text-amber-400' : 'text-white'
                      }`}>
                        {pl.points}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Légende */}
          <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-green-500/25 border border-green-500/40" /> Score exact (+3)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-blue-500/25 border border-blue-500/40" /> Bon vainqueur, écart proche (+2)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-slate-500/25 border border-slate-500/40" /> Bon vainqueur (+1)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-red-900/30 border border-red-900/50" /> Raté (0)
            </span>
          </div>
        </>
      )}
    </div>
  );
}
