import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import api from '../api/client';
import TeamCrest from '../components/TeamCrest';
import { matchState, STATE, STATE_CHIP, useNow } from '../utils/matchState';

function ResultDot({ res }) {
  const cls = {
    V: 'bg-green-500 text-slate-950',
    N: 'bg-slate-700 text-slate-300',
    D: 'bg-slate-800 text-slate-500 border border-slate-700',
  }[res] || 'bg-slate-800 text-slate-500';
  return (
    <span className={`inline-flex items-center justify-center w-[18px] h-[18px] rounded-sm font-display text-[10px] font-bold ${cls}`}>
      {res}
    </span>
  );
}

function StateChip({ state }) {
  return (
    <span className={`font-display text-[9.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded inline-flex items-center gap-1 whitespace-nowrap ${STATE_CHIP[state]}`}>
      {state === 'encours' && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
      {STATE[state].short}
    </span>
  );
}

const FILTERS = [
  { key: 'tous',    label: 'Tous'      },
  { key: 'avenir',  label: 'À venir'   },
  { key: 'encours', label: 'En cours'  },
  { key: 'termine', label: 'Terminés'  },
];

export default function Top14Page() {
  const now = useNow(60000);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [rounds, setRounds] = useState([]);
  const [round, setRound] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [filter, setFilter] = useState('tous');

  useEffect(() => {
    api.get('/standings')
      .then((res) => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));

    api.get('/matches/rounds').then((res) => setRounds(res.data)).catch(console.error);

    // On ouvre sur la journée en cours ou la dernière jouée, pas sur la précédente.
    // Le backend renvoie currentRound ; on retombe sur round - 1 si l'API est ancienne.
    api.get('/matches/next-round')
      .then((res) => setRound(res.data.currentRound ?? Math.max(1, res.data.round - 1)))
      .catch(() => setRound(1));
  }, []);

  useEffect(() => {
    if (!round) return;
    setLoadingMatches(true);
    api.get(`/matches?round=${round}`)
      .then((res) => setMatches(res.data))
      .catch(console.error)
      .finally(() => setLoadingMatches(false));
  }, [round]);

  const table = data?.table || [];
  const played = table.filter((r) => r.form?.recent?.length);
  const hot = played.filter((r) => r.form.weather.streakType === 'V' && r.form.weather.streak >= 2);
  const cold = played.filter((r) => r.form.weather.streakType === 'D' && r.form.weather.streak >= 2);

  // « En cours » regroupe aussi les matchs commencés dont le score n'est pas
  // encore tombé : dans les deux cas la rencontre n'est pas finie.
  const inFilter = (m, key) => {
    const s = matchState(m, now);
    if (key === 'tous') return true;
    if (key === 'encours') return s === 'encours' || s === 'attente';
    return s === key;
  };

  const counts = Object.fromEntries(
    FILTERS.map((f) => [f.key, matches.filter((m) => inFilter(m, f.key)).length])
  );
  const visible = matches.filter((m) => inFilter(m, filter));

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="font-display text-[26px] font-extrabold leading-none mb-1">Le championnat</h1>
      <p className="text-xs italic text-slate-500 mb-5">
        Saison {data?.season || '2026-2027'}
        {data?.fetchedAt && (
          <> · classement relevé {format(new Date(data.fetchedAt), "d MMMM 'à' HH'h'mm", { locale: fr })}</>
        )}
      </p>

      {loading ? (
        <div className="text-center py-16 text-slate-500 animate-pulse">Chargement…</div>
      ) : table.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-slate-500">Classement pas encore disponible.</p>
          <p className="text-slate-600 text-sm mt-1">Il sera relevé automatiquement dans les prochaines heures.</p>
        </div>
      ) : (
        <>
          {/* Météo résumée */}
          {(hot.length > 0 || cold.length > 0) && (
            <div className="grid gap-3 sm:grid-cols-2 mb-6">
              {hot.length > 0 && (
                <div className="card">
                  <h2 className="rule-label mb-3">☀️ En forme</h2>
                  <div className="space-y-2">
                    {hot.slice(0, 4).map((r) => (
                      <div key={r.shortName} className="flex items-center gap-2.5 text-[13px]">
                        <TeamCrest team={r} size={20} />
                        <span className="font-display font-bold truncate">{r.name}</span>
                        <span className="ml-auto text-green-400 shrink-0">
                          {r.form.weather.streak} victoires de suite
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {cold.length > 0 && (
                <div className="card">
                  <h2 className="rule-label mb-3">🌧️ En difficulté</h2>
                  <div className="space-y-2">
                    {cold.slice(0, 4).map((r) => (
                      <div key={r.shortName} className="flex items-center gap-2.5 text-[13px]">
                        <TeamCrest team={r} size={20} />
                        <span className="font-display font-bold truncate">{r.name}</span>
                        <span className="ml-auto text-slate-500 shrink-0">
                          {r.form.weather.streak} défaites de suite
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Classement */}
          <h2 className="rule-label mb-3">Classement</h2>
          <div className="card overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-xs">
              <thead>
                <tr className="font-display text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="text-left pb-2.5 pl-1 pr-2">#</th>
                  <th className="text-left pb-2.5 pr-2">Club</th>
                  <th className="pb-2.5 px-1.5">J</th>
                  <th className="pb-2.5 px-1.5 hidden sm:table-cell">G</th>
                  <th className="pb-2.5 px-1.5 hidden sm:table-cell">N</th>
                  <th className="pb-2.5 px-1.5 hidden sm:table-cell">P</th>
                  <th className="pb-2.5 px-1.5">Diff</th>
                  <th className="pb-2.5 px-1.5 hidden md:table-cell" title="Essais marqués">EM</th>
                  <th className="pb-2.5 px-1.5 hidden md:table-cell" title="Essais encaissés">EE</th>
                  <th className="pb-2.5 px-1.5 hidden lg:table-cell" title="Bonus offensif">BO</th>
                  <th className="pb-2.5 px-1.5 hidden lg:table-cell" title="Bonus défensif">BD</th>
                  <th className="pb-2.5 px-1.5">Forme</th>
                  <th className="pb-2.5 pl-2 pr-1 text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {table.map((r) => {
                  const zone =
                    r.rank <= 2 ? 'border-l-[3px] border-l-green-500'
                    : r.rank <= 6 ? 'border-l-[3px] border-l-blue-400'
                    : r.rank >= 14 ? 'border-l-[3px] border-l-red-400'
                    : 'border-l-[3px] border-l-transparent';
                  return (
                    <tr key={r.shortName} className="border-t border-slate-800">
                      <td className={`py-2 pl-1 pr-2 font-display font-bold text-slate-500 tabular-nums ${zone}`}>
                        {r.rank}
                      </td>
                      <td className="py-2 pr-2">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <TeamCrest team={r} size={20} />
                          <span className="font-display font-bold truncate">{r.name}</span>
                        </div>
                      </td>
                      <td className="py-2 px-1.5 text-center tabular-nums text-slate-400">{r.played}</td>
                      <td className="py-2 px-1.5 text-center tabular-nums text-slate-400 hidden sm:table-cell">{r.won}</td>
                      <td className="py-2 px-1.5 text-center tabular-nums text-slate-400 hidden sm:table-cell">{r.drawn}</td>
                      <td className="py-2 px-1.5 text-center tabular-nums text-slate-400 hidden sm:table-cell">{r.lost}</td>
                      <td className={`py-2 px-1.5 text-center tabular-nums font-medium ${r.diff > 0 ? 'text-green-400' : r.diff < 0 ? 'text-slate-500' : 'text-slate-400'}`}>
                        {r.diff > 0 ? '+' : ''}{r.diff}
                      </td>
                      <td className="py-2 px-1.5 text-center tabular-nums text-slate-400 hidden md:table-cell">{r.triesFor}</td>
                      <td className="py-2 px-1.5 text-center tabular-nums text-slate-500 hidden md:table-cell">{r.triesAgainst}</td>
                      <td className="py-2 px-1.5 text-center tabular-nums text-amber-500 hidden lg:table-cell">{r.bonusOff}</td>
                      <td className="py-2 px-1.5 text-center tabular-nums text-blue-400 hidden lg:table-cell">{r.bonusDef}</td>
                      <td className="py-2 px-1.5 text-center" title={r.form?.weather?.label || ''}>
                        <span className="text-base leading-none">{r.form?.weather?.icon || '—'}</span>
                      </td>
                      <td className="py-2 pl-2 pr-1 text-right font-display text-[15px] font-extrabold tabular-nums">
                        {r.points}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[11.5px] text-slate-500">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-500" /> Demi-finales</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-400" /> Barrages</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-400" /> Relégation</span>
            <span>EM / EE : essais marqués et encaissés · BO / BD : bonus offensif et défensif</span>
          </div>

          {/* Cinq derniers résultats */}
          <h2 className="rule-label mt-8 mb-3">Les cinq derniers matchs de chaque club</h2>
          <div className="card">
            <div className="grid gap-2 sm:grid-cols-2">
              {table.map((r) => (
                <div key={r.shortName} className="flex items-center gap-2.5 py-1.5">
                  <TeamCrest team={r} size={18} />
                  <span className="text-[13px] truncate">{r.name}</span>
                  <span className="ml-auto flex gap-1 shrink-0">
                    {(r.form?.recent || []).length === 0 ? (
                      <span className="text-slate-600 text-[11.5px]">pas encore joué</span>
                    ) : (
                      [...r.form.recent].reverse().map((x, i) => <ResultDot key={i} res={x.res} />)
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Matchs par journée */}
      <h2 className="rule-label mt-8 mb-3">Les matchs journée par journée</h2>

      {rounds.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1.5 mb-3 scrollbar-none">
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

      {/* Filtre par état */}
      <div className="flex gap-1.5 overflow-x-auto pb-1.5 mb-4 scrollbar-none">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            disabled={counts[f.key] === 0 && f.key !== 'tous'}
            className={`shrink-0 font-display text-[12.5px] font-semibold px-3 py-1.5 rounded-full border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              filter === f.key
                ? 'chip-accent border-transparent'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-amber-500 hover:text-white'
            }`}
          >
            {f.label}
            <span className="ml-1.5 opacity-70 tabular-nums">{counts[f.key] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="card">
        {loadingMatches ? (
          <p className="text-center py-6 text-slate-500 animate-pulse">Chargement…</p>
        ) : matches.length === 0 ? (
          <p className="text-center py-6 text-slate-500">Aucun match pour cette journée.</p>
        ) : visible.length === 0 ? (
          <p className="text-center py-6 text-slate-500">
            Aucun match {FILTERS.find((f) => f.key === filter)?.label.toLowerCase()} dans cette journée.
          </p>
        ) : (
          <div className="divide-y divide-slate-800">
            {visible.map((m) => {
              const state = matchState(m, now);
              const done = state === 'termine';
              const homeWon = done && m.homeScore > m.awayScore;
              const awayWon = done && m.awayScore > m.homeScore;
              return (
                <div key={m.id} className="py-2.5">
                  <div className="flex items-center gap-2 text-[13px]">
                    <div className="flex-1 min-w-0 flex items-center justify-end gap-2">
                      <span className={`truncate font-display ${homeWon ? 'font-bold' : 'text-slate-400'}`}>
                        {m.homeTeam.name}
                      </span>
                      <TeamCrest team={m.homeTeam} size={20} />
                    </div>

                    <div className="shrink-0 w-[74px] text-center">
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

                  <div className="flex justify-center mt-1.5">
                    <StateChip state={state} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {data?.source && (
        <p className="text-[11px] italic text-slate-600 mt-5">
          Classement relevé sur {data.source}. Les résultats des matchs proviennent de notre propre
          synchronisation, la forme des équipes en est calculée. Un match est dit « en cours »
          pendant les 2 h 30 qui suivent son coup d'envoi, tant qu'aucun score n'est enregistré.
        </p>
      )}
    </div>
  );
}
