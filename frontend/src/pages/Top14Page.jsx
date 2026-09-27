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

/**
 * La variation de rang, telle que la LNR l'affiche : une flèche, pas un chiffre.
 *
 * Le champ arrive en mots — « up », « down », « same » — et non en nombre. La
 * première version de ce composant faisait `Number(value)` : sur « up » ça donne
 * NaN, et la flèche ne s'affichait jamais. On accepte donc les deux formes, les
 * mots comme les nombres signés, au cas où la source change d'avis.
 *
 * Rien ne s'affiche quand rien n'a bougé : une flèche neutre sur quatorze lignes
 * ne fait que du bruit.
 */
function Variation({ value }) {
  const mot = String(value ?? '').trim().toLowerCase();
  const n = Number(mot);

  const sens = Number.isFinite(n) && mot !== ''
    ? (n > 0 ? 1 : n < 0 ? -1 : 0)
    : ['up', 'hausse', 'monte', 'plus'].includes(mot) ? 1
    : ['down', 'baisse', 'descend', 'moins'].includes(mot) ? -1
    : 0;

  if (sens === 0) return null;

  // Le nombre de places n'est connu que si la source l'a donné en chiffres.
  const places = Number.isFinite(n) && n !== 0 ? Math.abs(n) : null;
  const titre = places
    ? `${sens > 0 ? 'Gagne' : 'Perd'} ${places} place${places > 1 ? 's' : ''}`
    : sens > 0 ? 'En progression' : 'En recul';

  return (
    <span
      title={titre}
      className={`ml-0.5 text-[9px] leading-none ${sens > 0 ? 'text-green-400' : 'text-red-400'}`}
    >
      {sens > 0 ? '▲' : '▼'}
    </span>
  );
}

/** Pastille de la legende du classement, de la meme largeur que la barre du tableau. */
function ZoneKey({ cls, children }) {
  return (
    <span className="flex items-center gap-2">
      <span className={`inline-block w-[7px] h-4 rounded-[2px] ${cls}`} />
      {children}
    </span>
  );
}

const FILTERS = [
  { key: 'tous',    label: 'Tous'      },
  { key: 'avenir',  label: 'À venir'   },
  { key: 'encours', label: 'En cours'  },
  { key: 'termine', label: 'Terminés'  },
];

/**
 * L'encadré d'alerte. Couleurs en clair, pour la même raison que les pastilles
 * de multiplicateur : `text-white` et l'échelle `slate` du projet sont des
 * couleurs relatives au thème, et basculent avec lui. Sur un fond de couleur
 * fixe, elles donneraient de l'encre sombre sur fond sombre la moitié du temps.
 */
const ALERTE = {
  background: '#7c2d12',
  color: '#fed7aa',
  border: '1px solid #c2410c',
  borderRadius: '8px',
  padding: '10px 14px',
  fontSize: '12.5px',
  lineHeight: 1.45,
};

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

  /**
   * Les matchs journée par journée. Extrait dans une variable pour pouvoir le
   * placer juste sous le classement sans dépendre du chargement de celui-ci :
   * si le classement n'est pas encore relevé, les résultats restent affichés.
   */
  const matchesSection = (
    <>
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

                  {/* Le diffuseur se pose sur la ligne d'état, pas à côté de
                      l'heure : la colonne centrale ne fait que 74 px et doit
                      rester lisible, alors que cette ligne-ci est déjà centrée
                      et a de la place.

                      Avant le coup d'envoi seulement — après, la chaîne qui a
                      diffusé le match n'apprend plus rien. */}
                  <div className="flex justify-center items-center gap-1.5 flex-wrap mt-1.5">
                    <StateChip state={state} />
                    {m.broadcaster && state === 'avenir' && (
                      <span
                        title={`Diffusion : ${m.broadcaster}`}
                        className="font-display text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded
                                   bg-slate-700/40 text-slate-400 border border-slate-700 whitespace-nowrap"
                      >
                        📺 {m.broadcaster}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="font-display text-[26px] font-extrabold leading-none mb-1">Le championnat</h1>
      <p className="text-xs italic text-slate-500 mb-5">
        Saison {data?.season || '2026-2027'}
        {data?.fetchedAt && (
          <> · classement relevé {format(new Date(data.fetchedAt), "d MMMM 'à' HH'h'mm", { locale: fr })}</>
        )}
      </p>

      {/* L'alerte de fraîcheur.

          Elle ne s'affiche que lorsque le tableau est réellement en retard sur
          les résultats, pas au bout d'un certain temps. Hors championnat, un
          classement vieux de cinq jours est juste : rien ne s'est joué. Un
          délai fixe déclencherait une alerte fausse à chaque trêve — et une
          alerte fausse qu'on apprend à ignorer ne sert plus à rien le jour où
          elle est vraie.

          Couleurs en style direct : sur un aplat de couleur fixe, il faut une
          encre fixe. Les classes de la palette du projet sont relatives au
          thème et basculeraient avec lui alors que le fond, lui, ne bouge pas. */}
      {data?.fraicheur && !data.fraicheur.aJour && data.fraicheur.retard > 0 && (
        <div style={ALERTE} className="mb-5">
          <p style={{ fontWeight: 700, marginBottom: 2 }}>
            ⚠ Ce classement n'est plus à jour
          </p>
          <p style={{ opacity: 0.92 }}>
            Il compte {data.fraicheur.comptees} rencontre
            {data.fraicheur.comptees > 1 ? 's' : ''} sur les {data.fraicheur.termines}{' '}
            terminées à ce jour
            {data.fraicheur.retard === 1
              ? ' — il en manque une.'
              : ` — il en manque ${data.fraicheur.retard}.`}{' '}
            Le recalcul est automatique et se retente toutes les quelques
            minutes ; s'il persiste, c'est que la source ne répond plus.
          </p>
        </div>
      )}

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

          {/*
            Le classement, aux colonnes de la LNR.

            L'ordre est le sien : rang, club, points, puis matchs joués, gagnés,
            nuls, perdus, bonus, points marqués, encaissés, différence, état de
            forme, prochain match. Les points arrivent juste après le club et non
            tout à droite — c'est la seule colonne qu'on lit à tous les coups, et
            la mettre en tête évite d'avoir à faire défiler le tableau pour la
            voir sur un téléphone.

            EM / EE / BO / BD ont disparu. La LNR ne publie pas les essais ni le
            détail des bonus dans ce tableau : depuis qu'on prend son classement
            tel quel, ces quatre colonnes n'affichaient plus que des tirets. Une
            colonne vide n'est pas une information manquante, c'est du bruit — le
            total « Bonus » de la LNR les remplace.

            Les colonnes secondaires s'effacent par paliers plutôt que de forcer
            un défilement horizontal : un tableau qu'il faut pousser du doigt
            pour lire le classement est un tableau qu'on ne lit pas. Le reste
            reste accessible en tournant le téléphone ou sur un écran plus large.
          */}
          <h2 className="rule-label mb-3">Classement</h2>
          <div className="card overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-xs">
              <thead>
                <tr className="font-display text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="text-left pb-2.5 pl-1 pr-2">#</th>
                  <th className="text-left pb-2.5 pr-2">Club</th>
                  <th className="pb-2.5 px-1.5 text-right" title="Points de classement">Pts</th>
                  <th className="pb-2.5 px-1.5" title="Matchs joués">M</th>
                  <th className="pb-2.5 px-1.5 hidden sm:table-cell" title="Gagnés">G</th>
                  <th className="pb-2.5 px-1.5 hidden sm:table-cell" title="Nuls">N</th>
                  <th className="pb-2.5 px-1.5 hidden sm:table-cell" title="Perdus">P</th>
                  <th className="pb-2.5 px-1.5 hidden md:table-cell" title="Points de bonus">Bonus</th>
                  <th className="pb-2.5 px-1.5 hidden lg:table-cell" title="Points marqués">Pts M.</th>
                  <th className="pb-2.5 px-1.5 hidden lg:table-cell" title="Points encaissés">Pts E.</th>
                  <th className="pb-2.5 px-1.5" title="Différence de points">Diff</th>
                  <th className="pb-2.5 px-1.5 hidden sm:table-cell" title="État de forme">Forme</th>
                  <th className="text-left pb-2.5 pl-2 pr-1 hidden lg:table-cell" title="Prochaine rencontre">Prochain</th>
                </tr>
              </thead>
              <tbody>
                {table.map((r) => {
                  // Barre de zone : 7 px, assez large pour se lire d'un coup d'œil.
                  const zone =
                    r.rank <= 2 ? 'border-l-[7px] border-l-green-500'
                    : r.rank <= 6 ? 'border-l-[7px] border-l-blue-400'
                    : r.rank >= 14 ? 'border-l-[7px] border-l-red-400'
                    : 'border-l-[7px] border-l-transparent';

                  // L'état de forme officiel de la LNR (V / N / D, du plus ancien
                  // au plus récent). S'il manque, on retombe sur le nôtre, calculé
                  // depuis nos propres résultats : les deux disent la même chose.
                  const forme =
                    (r.formeLnr && r.formeLnr.length ? r.formeLnr : null) ||
                    (r.form?.recent || []).map((x) => x.res);

                  return (
                    <tr key={r.shortName} className="border-t border-slate-800">
                      <td className={`py-2 pl-2 pr-2 font-display font-bold text-slate-500 tabular-nums whitespace-nowrap ${zone}`}>
                        {r.rank}
                        <Variation value={r.variation} />
                      </td>
                      <td className="py-2 pr-2">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <TeamCrest team={r} size={20} />
                          <span className="font-display font-bold truncate">{r.name}</span>
                        </div>
                      </td>
                      <td className="py-2 px-1.5 text-right font-display text-[15px] font-extrabold tabular-nums">
                        {r.points}
                      </td>
                      <td className="py-2 px-1.5 text-center tabular-nums text-slate-400">{r.played}</td>
                      <td className="py-2 px-1.5 text-center tabular-nums text-slate-400 hidden sm:table-cell">{r.won}</td>
                      <td className="py-2 px-1.5 text-center tabular-nums text-slate-400 hidden sm:table-cell">{r.drawn}</td>
                      <td className="py-2 px-1.5 text-center tabular-nums text-slate-400 hidden sm:table-cell">{r.lost}</td>
                      <td className="py-2 px-1.5 text-center tabular-nums text-amber-500 hidden md:table-cell">
                        {r.bonus ?? 0}
                      </td>
                      <td className="py-2 px-1.5 text-center tabular-nums text-slate-400 hidden lg:table-cell">{r.pointsFor}</td>
                      <td className="py-2 px-1.5 text-center tabular-nums text-slate-500 hidden lg:table-cell">{r.pointsAgainst}</td>
                      <td className={`py-2 px-1.5 text-center tabular-nums font-medium ${r.diff > 0 ? 'text-green-400' : r.diff < 0 ? 'text-slate-500' : 'text-slate-400'}`}>
                        {r.diff > 0 ? '+' : ''}{r.diff}
                      </td>
                      <td className="py-2 px-1.5 hidden sm:table-cell">
                        {forme.length === 0 ? (
                          <span className="text-slate-600">—</span>
                        ) : (
                          <span
                            className="flex gap-1 justify-center"
                            title={r.form?.weather?.label || 'Du plus ancien au plus récent'}
                          >
                            {forme.slice(-5).map((res, i) => <ResultDot key={i} res={res} />)}
                          </span>
                        )}
                      </td>
                      {/* Le prochain match. Le lien va sur la feuille de match de
                          la LNR quand elle est connue ; sinon on se contente du
                          texte, plutôt qu'un lien mort.

                          La date arrive en francais et en clair (« 3 octobre »),
                          pas en ISO : on l'affiche telle quelle. La premiere
                          version la passait a `new Date()` puis a `format()`, qui
                          leve une exception sur une date invalide — et une
                          exception pendant l'affichage, ce n'est pas une colonne
                          vide, c'est la page entiere en blanc. */}
                      <td className="py-2 pl-2 pr-1 hidden lg:table-cell whitespace-nowrap text-slate-400">
                        {!r.prochain ? (
                          <span className="text-slate-600">—</span>
                        ) : (
                          <span title={r.prochain.date ? `Le ${r.prochain.date}` : ''}>
                            <span className="text-slate-600 mr-1">{r.prochain.domicile ? 'reçoit' : 'à'}</span>
                            {r.prochain.url ? (
                              <a
                                href={r.prochain.url}
                                target="_blank"
                                rel="noreferrer"
                                className="hover:text-amber-500 transition-colors"
                              >
                                {r.prochain.adversaire}
                              </a>
                            ) : (
                              r.prochain.adversaire
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[11.5px] text-slate-500">
            <ZoneKey cls="bg-green-500">Demi-finales</ZoneKey>
            <ZoneKey cls="bg-blue-400">Barrages</ZoneKey>
            <ZoneKey cls="bg-red-400">Relégation</ZoneKey>
            <span>M : matchs joués · Pts M. / Pts E. : points marqués et encaissés · Forme : les cinq derniers, du plus ancien au plus récent</span>
          </div>
        </>
      )}

      {/* Les résultats viennent directement sous le classement */}
      {matchesSection}

      {/*
        Le bloc « les cinq derniers matchs de chaque club » a été retiré : la
        colonne Forme du classement dit exactement la même chose, avec les mêmes
        pastilles, sans faire défiler la page. C'était l'un des blocs que le
        passage au classement officiel permettait de supprimer.
      */}

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
