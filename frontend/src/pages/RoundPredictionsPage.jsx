import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import TeamCrest from '../components/TeamCrest';

function cellClass(points) {
  if (points === null || points === undefined) return 'bg-slate-800/45 text-slate-400';
  return {
    3: 'bg-green-500/25 text-green-400 font-extrabold',
    2: 'bg-amber-500/20 text-amber-500',
    1: 'bg-slate-700/30 text-slate-400',
    0: 'bg-slate-800/60 text-slate-500',
  }[points] || 'bg-slate-800/60 text-slate-500';
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

  const playersById = {};
  for (const p of predictions) {
    if (!playersById[p.user.id]) playersById[p.user.id] = { ...p.user, points: 0, count: 0 };
    playersById[p.user.id].count++;
    if (typeof p.points === 'number') playersById[p.user.id].points += p.points;
  }
  const players = Object.values(playersById).sort(
    (a, b) => b.points - a.points || a.username.localeCompare(b.username)
  );

  const byUserMatch = {};
  for (const p of predictions) byUserMatch[`${p.user.id}-${p.matchId}`] = p;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h1 className="font-display text-[26px] font-extrabold leading-none">Tous les pronos</h1>
        <Link to="/pronostics" className="text-sm text-slate-500 hover:text-amber-500 transition-colors whitespace-nowrap">
          ← Mes pronos
        </Link>
      </div>
      <p className="text-xs italic text-slate-500 mb-5">Qui a vu juste cette journée</p>

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

      {loading ? (
        <div className="text-center py-16 text-slate-500 animate-pulse">Chargement…</div>
      ) : players.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-500 text-lg mb-2">Aucun pronostic pour la journée {currentRound}</p>
          <p className="text-slate-600 text-sm">Les pronos s'afficheront dès que les joueurs auront misé</p>
        </div>
      ) : (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 bg-slate-900 text-left font-display text-[10.5px] font-bold uppercase tracking-wider text-slate-500 px-2 pb-2.5 min-w-[7rem]">
                    Joueur
                  </th>
                  {matches.map((m) => (
                    <th key={m.id} className="px-1.5 pb-2.5 min-w-[4.6rem] align-bottom">
                      <div className="flex items-center justify-center gap-1">
                        <TeamCrest team={m.homeTeam} size={18} />
                        <span className="text-slate-600 text-[10px]">–</span>
                        <TeamCrest team={m.awayTeam} size={18} />
                      </div>
                      <div className="font-display text-[11.5px] font-bold mt-0.5">
                        {m.status === 'FINISHED' ? (
                          <span className="text-white">{m.homeScore}–{m.awayScore}</span>
                        ) : (
                          <span className="text-slate-600">à venir</span>
                        )}
                      </div>
                    </th>
                  ))}
                  <th className="px-2 pb-2.5 text-right font-display text-[10.5px] font-bold uppercase tracking-wider text-slate-500 min-w-[3.5rem]">
                    Pts
                  </th>
                </tr>
              </thead>
              <tbody>
                {players.map((pl) => {
                  const isMe = pl.id === user?.id;
                  return (
                    <tr key={pl.id}>
                      <td className={`sticky left-0 z-10 px-2 py-1.5 ${isMe ? 'bg-amber-500/10' : 'bg-slate-900'}`}>
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <span
                            className="w-[7px] h-[7px] rounded-full shrink-0"
                            style={{ backgroundColor: pl.avatarColor }}
                          />
                          <span className={`truncate ${isMe ? 'text-amber-500 font-semibold' : 'text-slate-400'}`}>
                            {pl.username}
                          </span>
                        </div>
                      </td>

                      {matches.map((m) => {
                        const p = byUserMatch[`${pl.id}-${m.id}`];
                        return (
                          <td key={m.id} className="px-0.5 py-0.5">
                            <div
                              className={`rounded py-1.5 text-center font-display text-[12px] font-bold tabular-nums ${
                                p ? cellClass(p.points) : 'bg-slate-800/25 text-slate-600'
                              }`}
                            >
                              {p ? `${p.homeScorePred}–${p.awayScorePred}` : '—'}
                            </div>
                          </td>
                        );
                      })}

                      <td className={`px-2 py-1.5 text-right font-display text-[15px] font-extrabold tabular-nums ${isMe ? 'text-amber-500' : ''}`}>
                        {pl.points}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Légende */}
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-green-500/25 border border-green-500/45" /> Score exact +3
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-amber-500/20 border border-amber-500/45" /> Bon vainqueur, écart proche +2
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-slate-700/30 border border-slate-700" /> Bon vainqueur +1
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-slate-800/60 border border-slate-800" /> Raté 0
            </span>
          </div>
        </>
      )}
    </div>
  );
}
