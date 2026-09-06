import { useState, useEffect } from 'react';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';

function MedalIcon({ rank }) {
  if (rank === 1) return <span className="text-2xl">🥇</span>;
  if (rank === 2) return <span className="text-2xl">🥈</span>;
  if (rank === 3) return <span className="text-2xl">🥉</span>;
  return <span className="text-slate-500 font-bold w-8 text-center">{rank}</span>;
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
    return <div className="text-center py-16 text-slate-500 animate-pulse">Chargement du classement...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-6">🏆 Classement général</h1>

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
                className={`card flex items-center gap-4 transition-all ${
                  isMe ? 'border-amber-500/50 bg-amber-950/20' : ''
                } ${rank <= 3 ? 'border-opacity-60' : ''}`}
              >
                {/* Rang */}
                <div className="w-10 text-center shrink-0">
                  <MedalIcon rank={rank} />
                </div>

                {/* Avatar */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0"
                  style={{ backgroundColor: player.avatarColor }}
                >
                  {player.username[0].toUpperCase()}
                </div>

                {/* Infos */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold truncate">{player.username}</span>
                    {isMe && <span className="text-xs bg-amber-500 text-black px-1.5 py-0.5 rounded font-bold">toi</span>}
                  </div>
                  <div className="flex gap-3 mt-0.5 text-xs text-slate-400">
                    <span>{player.played} joués</span>
                    <span className="text-green-400">🎯 {player.exactScores} exacts</span>
                    <span className="text-blue-400">✅ {player.correctWinners} bons</span>
                    <span>{player.accuracy}% précision</span>
                  </div>
                </div>

                {/* Points */}
                <div className="text-right shrink-0">
                  <p className="text-2xl font-black text-amber-400">{player.totalPoints}</p>
                  <p className="text-xs text-slate-500">pts</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Légende du barème */}
      <div className="mt-8 card bg-slate-900/50">
        <h3 className="font-semibold mb-3 text-sm text-slate-400 uppercase tracking-wide">Barème des points</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span>🎯 Score exact (ex: 31-22 prédit → 31-22)</span><span className="font-bold text-green-400">3 pts</span></div>
          <div className="flex justify-between"><span>✅ Bon vainqueur, écart ≤ 5 pts</span><span className="font-bold text-blue-400">2 pts</span></div>
          <div className="flex justify-between"><span>✅ Bon vainqueur</span><span className="font-bold text-slate-300">1 pt</span></div>
          <div className="flex justify-between"><span>❌ Mauvais vainqueur</span><span className="font-bold text-red-400">0 pt</span></div>
        </div>
      </div>
    </div>
  );
}
