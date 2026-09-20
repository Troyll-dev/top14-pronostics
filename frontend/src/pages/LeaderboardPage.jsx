import { useState, useEffect } from 'react';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';

function MedalIcon({ rank }) {
  if (rank === 1) return <span className="text-2xl">🥇</span>;
  if (rank === 2) return <span className="text-2xl">🥈</span>;
  if (rank === 3) return <span className="text-2xl">🥉</span>;
  return <span className="font-display text-slate-500 font-bold w-8 text-center">{rank}</span>;
}

/**
 * Une ligne de classement, commune aux deux vues.
 * `stats` est la ligne de details sous le pseudo : elle differe entre le
 * general et la journee, le reste est identique.
 */
function PlayerRow({ rank, player, points, stats, isMe }) {
  return (
    <div
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
          {stats}
        </div>
      </div>

      <div className="text-right shrink-0">
        <p className="font-display text-[26px] font-extrabold leading-none tabular-nums text-amber-500">
          {points}
        </p>
        <p className="text-[10.5px] uppercase tracking-wide text-slate-500 mt-1">pts</p>
      </div>
    </div>
  );
}

export default function LeaderboardPage() {
  const { user } = useAuth();

  const [view, setView] = useState('general');

  const [general, setGeneral] = useState([]);
  const [loading, setLoading] = useState(true);

  const [rounds, setRounds] = useState([]);
  const [round, setRound] = useState(null);
  const [roundBoard, setRoundBoard] = useState([]);
  const [roundMatches, setRoundMatches] = useState([]);
  const [loadingRound, setLoadingRound] = useState(false);

  useEffect(() => {
    api.get('/leaderboard')
      .then((res) => setGeneral(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));

    api.get('/matches/rounds').then((res) => setRounds(res.data)).catch(console.error);

    // Journee en cours ou derniere jouee : c'est celle qu'on veut voir par defaut.
    api.get('/matches/next-round')
      .then((res) => setRound(res.data.currentRound ?? Math.max(1, res.data.round - 1)))
      .catch(() => setRound(1));
  }, []);

  // Le classement d'une journee n'est charge qu'a l'ouverture de l'onglet.
  useEffect(() => {
    if (view !== 'journee' || !round) return;
    setLoadingRound(true);
    Promise.all([
      api.get(`/leaderboard/round/${round}`),
      api.get(`/matches?round=${round}`),
    ])
      .then(([lb, ms]) => { setRoundBoard(lb.data); setRoundMatches(ms.data); })
      .catch(console.error)
      .finally(() => setLoadingRound(false));
  }, [view, round]);

  const finished = roundMatches.filter((m) => m.status === 'FINISHED').length;

  if (loading) {
    return <div className="text-center py-16 text-slate-500 animate-pulse">Chargement du classement…</div>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-display text-[26px] font-extrabold leading-none mb-1">🏆 Classement</h1>
      <p className="text-xs italic text-slate-500 mb-4">
        {view === 'general'
          ? 'Saison 2026-2027 · toutes journées confondues'
          : `Saison 2026-2027 · journée ${round ?? '—'} seule`}
      </p>

      {/* Général / Journée */}
      <div className="flex gap-1.5 mb-5">
        {[
          { key: 'general', label: 'Général' },
          { key: 'journee', label: round ? `Journée ${round}` : 'Journée' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            className={`font-display text-[13.5px] font-semibold px-4 py-1.5 rounded-full border transition-colors ${
              view === t.key
                ? 'chip-accent border-transparent'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-amber-500 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view === 'general' ? (
        general.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-slate-500">Aucun résultat encore disponible.</p>
            <p className="text-slate-600 text-sm mt-1">Le classement apparaît une fois les premiers matchs terminés.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {general.map((player, idx) => (
              <PlayerRow
                key={player.id}
                rank={idx + 1}
                player={player}
                points={player.totalPoints}
                isMe={player.id === user?.id}
                stats={
                  <>
                    <span>{player.played} joués</span>
                    <span className="text-green-400">🎯 {player.exactScores} exacts</span>
                    <span className="text-blue-400">✅ {player.correctWinners} bons</span>
                    <span>{player.accuracy}% précision</span>
                  </>
                }
              />
            ))}
          </div>
        )
      ) : (
        <>
          {/* Sélecteur de journée */}
          {rounds.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1.5 mb-4 scrollbar-none">
              {rounds.map((r) => (
                <button
                  key={r}
                  onClick={() => setRound(r)}
                  className={`shrink-0 font-display text-[13.5px] font-semibold px-3.5 py-1.5 rounded border transition-colors ${
                    round === r
                      ? 'chip-on'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-amber-500 hover:text-white'
                  }`}
                >
                  J{r}
                </button>
              ))}
            </div>
          )}

          {loadingRound ? (
            <div className="text-center py-12 text-slate-500 animate-pulse">Chargement…</div>
          ) : roundBoard.length === 0 ? (
            <div className="card text-center py-12">
              <p className="text-slate-500">Pas encore de points sur la journée {round}.</p>
              <p className="text-slate-600 text-sm mt-1">
                {roundMatches.length === 0
                  ? 'Aucun match enregistré pour cette journée.'
                  : `${finished} match${finished > 1 ? 's' : ''} terminé${finished > 1 ? 's' : ''} sur ${roundMatches.length}.`}
              </p>
            </div>
          ) : (
            <>
              {roundMatches.length > 0 && (
                <p className="text-[11.5px] text-slate-500 mb-3">
                  {finished} match{finished > 1 ? 's' : ''} terminé{finished > 1 ? 's' : ''} sur {roundMatches.length}
                  {finished < roundMatches.length && ' — le classement de la journée n’est pas définitif'}
                </p>
              )}

              <div className="space-y-2">
                {roundBoard.map((player, idx) => (
                  <PlayerRow
                    key={player.id}
                    rank={idx + 1}
                    player={player}
                    points={player.points}
                    isMe={player.id === user?.id}
                    stats={
                      <>
                        <span className="text-green-400">🎯 {player.exactScores} exact{player.exactScores > 1 ? 's' : ''}</span>
                        <span className="text-blue-400">✅ {player.correctWinners} bon{player.correctWinners > 1 ? 's' : ''}</span>
                      </>
                    }
                  />
                ))}
              </div>

              <p className="text-[11px] italic text-slate-600 mt-4">
                Seuls les joueurs ayant pronostiqué au moins un match de cette journée y figurent.
              </p>
            </>
          )}
        </>
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
