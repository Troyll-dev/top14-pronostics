import { useState, useEffect } from 'react';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';

function MedalIcon({ rank }) {
  if (rank === 1) return <span className="text-2xl">🥇</span>;
  if (rank === 2) return <span className="text-2xl">🥈</span>;
  if (rank === 3) return <span className="text-2xl">🥉</span>;
  return <span className="font-display text-slate-500 font-bold w-8 text-center">{rank}</span>;
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/leaderboard')
      .then((res) => setLeaderboard(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-center py-16 text-slate-500 animate-pulse">Chargement du classement…</div>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-display text-[26px] font-extrabold leading-none mb-1">🏆 Classement général</h1>
      <p className="text-xs italic text-slate-500 mb-5">Saison 2026-2027 · toutes journées confondues</p>

      {leaderboard.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-slate-500">Aucun résultat encore disponible.</p>
          <p className="text-slate-600 text-sm mt-1">Le classement apparaît une fois les premiers matchs terminés.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {leaderboard.map((player, idx) => {
            const rank = idx + 1;
            const isMe = player.id === user?.id;
            return (
              <div
                key={player.id}
                className={`card flex items-center gap-3.5 transition-all ${
                  isMe ? 'border-amber-500/55 bg-amber-500/[.07]' : ''
                } ${rank === 1 ? 'border-l-4 border-l-amber-500' : ''}`}
              >
                <div className="w-10 text-center shrink-0">
                  <MedalIcon rank={rank} />
                </div>

                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center font-display font-bold text-lg shrink-0"
                  style={{
                    backgroundColor: player.avatarColor,
                    color: '#fff',
                    boxShadow: '0 0 0 2px rgb(var(--a-500) / .45)',
                  }}
                >
                  {player.username[0].toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-display font-bold truncate ${isMe ? 'text-amber-500' : ''}`}>
                      {player.username}
                    </span>
                    {isMe && (
                      <span className="font-display text-[10px] chip-accent px-1.5 py-0.5 rounded font-bold uppercase tracking-wide">
                        toi
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11.5px] text-slate-500">
                    <span>{player.played} joués</span>
                    <span className="text-green-400">🎯 {player.exactScores} exacts</span>
                    <span className="text-blue-400">✅ {player.correctWinners} bons</span>
                    <span>{player.accuracy}% précision</span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <p className="font-display text-[26px] font-extrabold leading-none tabular-nums text-amber-500">
                    {player.totalPoints}
                  </p>
                  <p className="text-[10.5px] uppercase tracking-wide text-slate-500 mt-1">pts</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Barème */}
      <div className="card mt-7">
        <h3 className="rule-label mb-3.5">Barème des points</h3>
        <div className="space-y-2 text-sm text-slate-400">
          <div className="flex justify-between gap-3">
            <span>🎯 Score exact <span className="text-slate-500">(31-22 prédit → 31-22)</span></span>
            <span className="font-display font-bold text-green-400 shrink-0">3 pts</span>
          </div>
          <div className="flex justify-between gap-3">
            <span>✅ Bon vainqueur, écart ≤ 5 pts</span>
            <span className="font-display font-bold text-amber-500 shrink-0">2 pts</span>
          </div>
          <div className="flex justify-between gap-3">
            <span>✅ Bon vainqueur</span>
            <span className="font-display font-bold text-slate-400 shrink-0">1 pt</span>
          </div>
          <div className="flex justify-between gap-3">
            <span>❌ Mauvais vainqueur</span>
            <span className="font-display font-bold text-red-400 shrink-0">0 pt</span>
          </div>
        </div>
      </div>
    </div>
  );
}
