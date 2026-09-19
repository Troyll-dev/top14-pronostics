import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import TeamCrest from '../components/TeamCrest';
import { matchState, STATE, STATE_CHIP, useNow } from '../utils/matchState';

function pointsTone(points) {
  return {
    3: 'text-green-400',
    2: 'text-amber-500',
    1: 'text-slate-400',
    0: 'text-slate-600',
  }[points] || 'text-slate-600';
}

function StateChip({ state }) {
  return (
    <span className={`font-display text-[9.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded inline-flex items-center gap-1 whitespace-nowrap ${STATE_CHIP[state]}`}>
      {state === 'encours' && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
      {STATE[state].short}
    </span>
  );
}

export default function HomePage() {
  const { user } = useAuth();
  const now = useNow(60000);

  const [round, setRound] = useState(null);           // prochaine journée à pronostiquer
  const [resultsRound, setResultsRound] = useState(null); // journée en cours ou dernière jouée
  const [matches, setMatches] = useState([]);
  const [previous, setPrevious] = useState([]);
  const [results, setResults] = useState([]);
  const [board, setBoard] = useState([]);
  const [standings, setStandings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    api.get('/standings')
      .then((res) => alive && setStandings(res.data))
      .catch(() => {});

    (async () => {
      try {
        const next = await api.get('/matches/next-round');
        if (!alive) return;

        const r = next.data.round;
        const cr = next.data.currentRound ?? Math.max(1, r - 1);
        setRound(r);
        setResultsRound(cr);

        // Les trois journées utiles se recoupent souvent : on ne demande chacune
        // qu'une seule fois.
        const wanted = [...new Set([r, r - 1, cr])].filter((x) => x >= 1);
        const [pairs, lb] = await Promise.all([
          Promise.all(
            wanted.map((x) => api.get(`/matches?round=${x}`).then((q) => [x, q.data]))
          ),
          api.get('/leaderboard'),
        ]);
        if (!alive) return;

        const byRound = Object.fromEntries(pairs);
        setMatches(byRound[r] || []);
        setPrevious(byRound[r - 1] || []);
        setResults(byRound[cr] || []);
        setBoard(lb.data);
      } catch (err) {
        console.error(err);
      } finally {
        if (alive) setLoading(false);
      }
    })();

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

  const lastResults = previous.filter((m) => m.status === 'FINISHED').slice(-3).reverse();

  // On affiche la journée en cours dans l'ordre des coups d'envoi : les matchs
  // joués remontent naturellement au-dessus de ceux qui restent à venir.
  const dayResults = [...results].sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  const finishedCount = dayResults.filter((m) => matchState(m, now) === 'termine').length;
  const dayPoints = dayResults.reduce((sum, m) => sum + (m.predictions?.[0]?.points || 0), 0);

  const topFive = (standings?.table || []).slice(0, 5);

  // Le bloc « tes derniers pronos » ferait doublon si la journée affichée
  // au-dessus est déjà la précédente.
  const showLastResults = lastResults.length > 0 && resultsRound !== round - 1;

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

      {/* Journée en cours */}
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
              <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">
                Prochain coup d'envoi
              </p>
              <div className="flex items-center gap-2.5">
                <TeamCrest team={nextMatch.homeTeam} size={22} />
                <p className="font-display font-bold text-[14.5px] truncate">
                  {nextMatch.homeTeam.name}
                  <span className="text-slate-500 font-normal"> — </span>
                  {nextMatch.awayTeam.name}
                </p>
                <TeamCrest team={nextMatch.awayTeam} size={22} />
                <p className="ml-auto text-[12px] italic text-slate-500 shrink-0 first-letter:uppercase">
                  {format(new Date(nextMatch.kickoff), "EEE d MMM · HH'h'mm", { locale: fr })}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Les résultats de la journée en cours ou de la dernière jouée */}
      {dayResults.length > 0 && (
        <div className="card mb-4">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h2 className="rule-label">Les résultats · journée {resultsRound}</h2>
            <span className="text-[11px] text-slate-500 shrink-0 tabular-nums">
              {finishedCount}/{dayResults.length} joués
            </span>
          </div>

          <div className="divide-y divide-slate-800">
            {dayResults.map((m) => {
              const state = matchState(m, now);
              const done = state === 'termine';
              const homeWon = done && m.homeScore > m.awayScore;
              const awayWon = done && m.awayScore > m.homeScore;
              const p = m.predictions?.[0];
              return (
                <div key={m.id} className="py-2">
                  <div className="flex items-center gap-2 text-[13px]">
                    <div className="flex-1 min-w-0 flex items-center justify-end gap-2">
                      <span className={`truncate font-display ${homeWon ? 'font-bold' : 'text-slate-400'}`}>
                        {m.homeTeam.name}
                      </span>
                      <TeamCrest team={m.homeTeam} size={20} />
                    </div>

                    <div className="shrink-0 w-[72px] text-center">
                      {done ? (
                        <span className="font-display font-extrabold text-[15px] tabular-nums">
                          <span className={homeWon ? 'text-amber-500' : ''}>{m.homeScore}</span>
                          <span className="text-slate-600 mx-1">–</span>
                          <span className={awayWon ? 'text-amber-500' : ''}>{m.awayScore}</span>
                        </span>
                      ) : (
                        <span className="text-[11px] italic text-slate-600">
                          {format(new Date(m.kickoff), "d MMM · HH'h'mm", { locale: fr })}
                        </span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <TeamCrest team={m.awayTeam} size={20} />
                      <span className={`truncate font-display ${awayWon ? 'font-bold' : 'text-slate-400'}`}>
                        {m.awayTeam.name}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-2 mt-1.5">
                    <StateChip state={state} />
                    {p && (
                      <span className="text-[11px] text-slate-500 tabular-nums">
                        ton prono {p.homeScorePred}–{p.awayScorePred}
                        {done && (
                          <b className={`ml-1.5 font-display ${pointsTone(p.points)}`}>
                            +{p.points ?? 0}
                          </b>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between gap-3">
            <span className="text-[12.5px] text-slate-400">
              {finishedCount > 0 ? (
                <>
                  Tu marques <b className="font-display text-amber-500">{dayPoints} point{dayPoints > 1 ? 's' : ''}</b> sur cette journée
                </>
              ) : (
                'Aucun match terminé pour l’instant.'
              )}
            </span>
            <Link to="/top14" className="text-[13px] text-slate-500 hover:text-amber-500 transition-colors shrink-0">
              Tous les résultats →
            </Link>
          </div>
        </div>
      )}

      {/* Mon rang */}
      {me && (
        <Link to="/classement" className="card block mb-4 hover:border-amber-500 transition-colors">
          <h2 className="rule-label mb-3">Au classement des pronos</h2>
          <div className="flex items-center gap-4">
            <div className="text-center shrink-0 w-14">
              <p className="font-display text-[32px] font-extrabold leading-none text-amber-500">
                {myIndex + 1}
                <span className="text-sm align-top text-slate-500">{myIndex === 0 ? 'er' : 'e'}</span>
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

      {/* Aperçu du championnat */}
      {topFive.length > 0 && (
        <div className="card mb-4">
          <h2 className="rule-label mb-3">Le championnat</h2>

          <div className="divide-y divide-slate-800">
            {topFive.map((r) => (
              <div key={r.shortName} className="flex items-center gap-2.5 py-1.5 text-[13px]">
                <span className="font-display font-bold text-slate-500 w-4 shrink-0 tabular-nums">{r.rank}</span>
                <TeamCrest team={r} size={20} />
                <span className="font-display font-bold truncate">{r.name}</span>
                <span className="ml-auto shrink-0 text-base leading-none" title={r.form?.weather?.label || ''}>
                  {r.form?.weather?.icon || ''}
                </span>
                <span className="font-display font-extrabold tabular-nums w-7 text-right shrink-0">{r.points}</span>
              </div>
            ))}
          </div>

          <Streaks standings={standings} />

          <Link to="/top14" className="inline-block mt-3 text-[13px] text-slate-500 hover:text-amber-500 transition-colors">
            Classement complet et résultats →
          </Link>
        </div>
      )}

      {/* Derniers résultats */}
      {showLastResults && (
        <div className="card">
          <h2 className="rule-label mb-3">Tes derniers pronos · journée {round - 1}</h2>
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

/** Les deux clubs les plus en forme et les plus en difficulté du moment. */
function Streaks({ standings }) {
  const table = standings?.table || [];
  const hottest = table
    .filter((r) => r.form?.weather?.streakType === 'V' && r.form.weather.streak >= 2)
    .sort((a, b) => b.form.weather.streak - a.form.weather.streak)[0];
  const coldest = table
    .filter((r) => r.form?.weather?.streakType === 'D' && r.form.weather.streak >= 2)
    .sort((a, b) => b.form.weather.streak - a.form.weather.streak)[0];

  if (!hottest && !coldest) return null;

  return (
    <div className="mt-3 pt-3 border-t border-slate-800 space-y-1 text-[12.5px]">
      {hottest && (
        <p className="text-slate-400">
          ☀️ <b className="font-display">{hottest.name}</b> reste sur {hottest.form.weather.streak} victoires
        </p>
      )}
      {coldest && (
        <p className="text-slate-400">
          🌧️ <b className="font-display">{coldest.name}</b> a perdu ses {coldest.form.weather.streak} derniers matchs
        </p>
      )}
    </div>
  );
}
