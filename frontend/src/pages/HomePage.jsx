import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';

function pointsTone(points) {
  return {
    3: 'text-green-400',
    2: 'text-amber-500',
    1: 'text-slate-400',
    0: 'text-slate-600',
  }[points] || 'text-slate-600';
}

export default function HomePage() {
  const { user } = useAuth();
  const [round, setRound] = useState(null);
  const [matches, setMatches] = useState([]);
  const [previous, setPrevious] = useState([]);
  const [board, setBoard] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.get('/matches/next-round')
      .then((res) => {
        if (!alive) return;
        const r = res.data.round;
        setRound(r);
        return Promise.all([
          api.get(`/matches?round=${r}`),
          r > 1 ? api.get(`/matches?round=${r - 1}`) : Promise.resolve({ data: [] }),
          api.get('/leaderboard'),
        ]);
      })
      .then((res) => {
        if (!alive || !res) return;
        const [cur, prev, lb] = res;
        setMatches(cur.data);
        setPrevious(prev.data);
        setBoard(lb.data);
      })
      .catch(console.error)
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const open = matches.filter(
    (m) => m.status === 'SCHEDULED' && new Date() < new Date(m.kickoff)
  );
  const todo = open.filter((m) => !(m.predictions?.length > 0));
  const nextMatch = [...open].sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))[0];

  const myIndex = board.findIndex((p) => p.id === user?.id);
  const me = myIndex >= 0 ? board[myIndex] : null;
  const leader = board[0];

  const lastResults = previous
    .filter((m) => m.status === 'FINISHED')
    .slice(-3)
    .reverse();

  if (loading) {
    return <div className="text-center py-20 text-slate-500 animate-pulse">Chargement…</div>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-display text-[26px] font-extrabold leading-none mb-1">
        Salut {user?.username} 🏉
      </h1>
      <p className="text-xs italic text-slate-500 mb-6">
        {todo.length > 0
          ? `Il te reste ${todo.length} prono${todo.length > 1 ? 's' : ''} à poser.`
          : open.length > 0
          ? 'Tous tes pronos sont posés. Plus qu’à regarder les matchs.'
          : 'Rien à pronostiquer pour le moment.'}
      </p>

      {/* Appel à l'action principal */}
      <div className={`card stitched laced mb-4 ${todo.length > 0 ? 'border-l-4 border-l-amber-500' : ''}`}>
        <div className="relative z-10">
          <h2 className="rule-label mb-3">Journée {round}</h2>

          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="font-display text-[34px] font-extrabold leading-none tabular-nums">
                <span className={todo.length > 0 ? 'text-amber-500' : 'text-green-400'}>
                  {matches.length - todo.length}
                </span>
                <span className="text-slate-600">/{matches.length}</span>
              </p>
              <p className="text-[11px] uppercase tracking-wide text-slate-500 mt-1.5">
                pronostics posés
              </p>
            </div>

            <Link to="/pronostics" className="btn-primary text-[13px] py-2 shrink-0">
              {todo.length > 0 ? 'Faire mes pronos' : 'Voir la journée'}
            </Link>
          </div>

          {nextMatch && (
            <div className="mt-4 pt-3 border-t border-slate-800">
              <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-1.5">
                Prochain coup d'envoi
              </p>
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-display font-bold text-[15px] truncate">
                  {nextMatch.homeTeam.name}
                  <span className="text-slate-500 font-normal"> contre </span>
                  {nextMatch.awayTeam.name}
                </p>
                <p className="text-[12px] italic text-slate-500 shrink-0 first-letter:uppercase">
                  {format(new Date(nextMatch.kickoff), "EEE d MMM · HH'h'mm", { locale: fr })}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Ton rang */}
      {me && (
        <Link to="/classement" className="card block mb-4 hover:border-amber-500 transition-colors">
          <h2 className="rule-label mb-3">Au classement</h2>
          <div className="flex items-center gap-4">
            <div className="text-center shrink-0 w-14">
              <p className="font-display text-[32px] font-extrabold leading-none text-amber-500">
                {myIndex + 1}
                <span className="text-sm align-top text-slate-500">
                  {myIndex === 0 ? 'er' : 'e'}
                </span>
              </p>
              <p className="text-[10px] uppercase tracking-wide text-slate-500 mt-1">sur {board.length}</p>
            </div>

            <div className="flex-1 min-w-0 text-[13px] text-slate-400">
              <p>
                <b className="font-display text-white">{me.totalPoints} points</b>
                {me.exactScores > 0 && <> · {me.exactScores} score{me.exactScores > 1 ? 's' : ''} exact{me.exactScores > 1 ? 's' : ''}</>}
              </p>
              {leader && myIndex > 0 && (
                <p className="text-slate-500 mt-0.5">
                  {leader.totalPoints - me.totalPoints} point
                  {leader.totalPoints - me.totalPoints > 1 ? 's' : ''} derrière {leader.username}
                </p>
              )}
              {myIndex === 0 && <p className="text-green-400 mt-0.5">Tu mènes la danse 🥇</p>}
            </div>
          </div>
        </Link>
      )}

      {/* Derniers résultats */}
      {lastResults.length > 0 && (
        <div className="card">
          <h2 className="rule-label mb-3">Derniers résultats · journée {round - 1}</h2>
          <ul className="divide-y divide-slate-800">
            {lastResults.map((m) => {
              const p = m.predictions?.[0];
              return (
                <li key={m.id} className="flex items-center gap-3 py-2 text-[13px]">
                  <span className="flex-1 min-w-0 truncate text-slate-400">
                    {m.homeTeam.shortName} – {m.awayTeam.shortName}
                  </span>
                  <span className="font-display font-bold tabular-nums shrink-0">
                    {m.homeScore}–{m.awayScore}
                  </span>
                  <span className={`font-display font-bold text-xs shrink-0 w-12 text-right ${pointsTone(p?.points)}`}>
                    {p ? `+${p.points ?? 0}` : '—'}
                  </span>
                </li>
              );
            })}
          </ul>
          <Link to="/pronos" className="inline-block mt-3 text-[13px] text-slate-500 hover:text-amber-500 transition-colors">
            Voir les pronos de tout le monde →
          </Link>
        </div>
      )}
    </div>
  );
}
