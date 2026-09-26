import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import TeamCrest from '../components/TeamCrest';

/**
 * La couleur d'une cellule du tableau.
 *
 * Deux choses étaient fausses ici, et elles se cumulaient.
 *
 * D'abord les couleurs. C'étaient des voiles translucides — `bg-green-500/25`,
 * `bg-amber-500/20` — posés sur le fond de la carte. Un voile prend la couleur
 * de ce qu'il y a dessous : sur le fond nuit ils se détachaient, sur le fond
 * crème les quatre teintes devenaient quatre pâleurs presque identiques. On ne
 * distinguait plus un score exact d'un pronostic raté, ce qui vide le tableau
 * de son intérêt.
 *
 * Ensuite l'index. La fonction était indexée par le nombre de points, de 0 à 3.
 * Avec le joker, un score exact vaut 6 : l'index retombait alors sur la valeur
 * par défaut, c'est-à-dire la couleur de « raté ». Le meilleur pronostic de la
 * journée s'affichait comme le pire.
 *
 * On lit donc le barème (`basePoints`, toujours de 0 à 3) et on pose des
 * couleurs fixes, en clair : fond clair, encre sombre, identiques quel que soit
 * le thème puisque ni l'un ni l'autre ne dépend du fond de la page.
 *
 * Et surtout, quatre **teintes** différentes et non quatre valeurs de gris. Ma
 * première correction posait bien des couleurs fixes, mais « bon vainqueur » et
 * « raté » y étaient deux gris clairs voisins : indiscernables, donc le tableau
 * restait illisible. Deux nuances d'une même couleur ne se distinguent pas, quel
 * que soit le thème — il faut changer de teinte.
 *
 * Le code couleur suit le sens, et il se lit en deux temps. D'abord marqué ou
 * pas : vert si le pronostic rapporte, rouge pâle sinon — deux familles, deux
 * réponses. Ensuite, dans le vert, deux intensités selon que l'écart était
 * proche ou non. Et le bleu se réserve au score exact, qui n'est pas « mieux
 * marqué » mais autre chose : la performance rare de la journée, qu'on veut
 * repérer d'un bout à l'autre du tableau.
 *
 * Le score exact est le seul fond **saturé** du tableau, blanc sur bleu vif :
 * les trois autres cases sont des pastels, donc celle-là saute aux yeux sans
 * qu'on la cherche. C'est voulu — une récompense rare doit se voir de loin, et
 * un pastel de plus se serait fondu dans les autres.
 *
 * Mesuré : contraste du texte 5,2 / 5,6 / 7,5 / 5,3 (seuil 4,5) et écart
 * perceptif entre fonds de 42 au minimum, sur une échelle où 20 suffit à parler
 * de teintes franchement différentes. Le bleu vif est à 92 de la case la plus
 * proche, autrement dit hors de toute confusion possible.
 *
 * Le repli sur `points` couvre les pronostics d'avant les multiplicateurs, dont
 * `basePoints` est nul : à cette époque les deux valeurs étaient égales.
 */
/* La colonne des joueurs flotte au-dessus du tableau qui defile. Une ombre
   portee a droite le dit : sans elle, on ne comprend pas pourquoi une colonne
   reste immobile pendant que les autres bougent — on croit a un defaut
   d'affichage. Elle ne se voit que quand il y a effectivement quelque chose
   dessous, c'est-a-dire pendant le defilement. */
const OMBRE_COLONNE = '6px 0 8px -6px rgba(0,0,0,.45)';

const CELLULE = {
  3: { background: '#2563eb', color: '#ffffff', fontWeight: 800 },  // bleu vif    score exact
  2: { background: '#4ade80', color: '#064e3b', fontWeight: 700 },  // vert franc  bon vainqueur, ecart proche
  1: { background: '#bbf7d0', color: '#14532d', fontWeight: 700 },  // vert pale   bon vainqueur
  0: { background: '#fca5a5', color: '#7f1d1d', fontWeight: 600 },  // rouge pale  rate
};

// Pronostic posé, match pas encore joué : neutre et discret, il n'y a rien à
// juger. Volontairement différent des quatre autres, pour qu'on ne le prenne
// pas pour une note.
const CELLULE_ATTENTE = { background: 'rgba(148,163,184,.22)', color: 'inherit', fontWeight: 700 };
const CELLULE_VIDE = { background: 'rgba(148,163,184,.10)', color: 'inherit', fontWeight: 600 };

function styleCellule(p) {
  if (!p) return CELLULE_VIDE;
  const base = p.basePoints ?? p.points;
  if (base === null || base === undefined) return CELLULE_ATTENTE;
  return CELLULE[base] || CELLULE[0];
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
          {/* Le rembourrage horizontal est annulé sur la carte, et reporté
              sur les cellules des deux bords.

              La raison tient à la façon dont fonctionne une colonne collée :
              `left: 0` désigne le bord de la **boîte de contenu**, donc
              l'intérieur du rembourrage. Avec seize pixels de rembourrage, les
              cases qui défilent passent dans cette bande, à gauche du nom, et
              on les voit glisser à côté. Sur ordinateur les sept colonnes
              tiennent, rien ne défile, et le défaut reste invisible — il
              n'apparaît que sur téléphone.

              En style direct parce qu'il doit l'emporter sur `.card` quel que
              soit l'ordre des feuilles de style ; le rembourrage vertical,
              lui, est conservé. */}
          <div className="card overflow-x-auto" style={{ paddingLeft: 0, paddingRight: 0 }}>
            <table className="w-full border-separate border-spacing-0 text-xs">
              <thead>
                <tr>
                  <th
                    className="sticky left-0 z-20 bg-slate-900 text-left font-display text-[10.5px] font-bold uppercase tracking-wider text-slate-500 pl-4 pr-2 pb-2.5 min-w-[7rem]"
                    style={{ boxShadow: OMBRE_COLONNE }}
                  >
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
                  <th className="pl-2 pr-4 pb-2.5 text-right font-display text-[10.5px] font-bold uppercase tracking-wider text-slate-500 min-w-[3.5rem]">
                    Pts
                  </th>
                </tr>
              </thead>
              <tbody>
                {players.map((pl) => {
                  const isMe = pl.id === user?.id;
                  return (
                    <tr key={pl.id}>
                      {/* La colonne des joueurs reste collée à gauche pendant
                          que le reste défile : son fond doit donc être opaque,
                          sinon les cases passent derrière et le nom devient
                          illisible.

                          C'était le cas d'une seule ligne — la mienne — qui
                          portait `bg-amber-500/10` pour se distinguer. Un voile
                          à 10 %, donc 90 % de transparence. Sur ordinateur les
                          sept colonnes tiennent, rien ne défile, et le défaut
                          restait invisible.

                          Le repère reste, mais sous une forme qui ne troue pas
                          le fond : un liseré à gauche et le nom en ambre. C'est
                          déjà la façon dont « toi » est signalé dans la liste
                          des pronostics d'un match. */}
                      <td
                        className="sticky left-0 z-10 pl-4 pr-2 py-1.5 bg-slate-900"
                        style={{
                          boxShadow: isMe
                            ? `inset 3px 0 0 rgb(var(--a-500)), ${OMBRE_COLONNE}`
                            : OMBRE_COLONNE,
                        }}
                      >
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
                              style={styleCellule(p)}
                              className="rounded py-1 text-center font-display text-[12px] tabular-nums leading-tight"
                            >
                              {p ? `${p.homeScorePred}–${p.awayScorePred}` : '—'}
                              {/* Le gain, sous le pronostic. La couleur disait
                                  déjà la qualité du pari, mais pas ce qu'il a
                                  rapporté — et avec les multiplicateurs les
                                  deux ne coïncident plus : un « bon vainqueur »
                                  joué en joker rapporte plus qu'un score exact
                                  ordinaire. */}
                              {p && p.points !== null && p.points !== undefined && (
                                <div className="text-[9.5px] font-bold opacity-80">
                                  {p.joker && '🃏'}+{p.points}
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}

                      <td className={`pl-2 pr-4 py-1.5 text-right font-display text-[15px] font-extrabold tabular-nums ${isMe ? 'text-amber-500' : ''}`}>
                        {pl.points}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Légende */}
          {/* La légende reprend exactement les couleurs des cellules, en
              partageant le même objet : elles ne peuvent plus diverger. */}
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
            {[
              [3, 'Score exact'],
              [2, 'Bon vainqueur, écart proche'],
              [1, 'Bon vainqueur'],
              [0, 'Raté'],
            ].map(([n, libelle]) => (
              <span key={n} className="flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-sm"
                  style={{ background: CELLULE[n].background, border: '1px solid rgba(0,0,0,.15)' }}
                />
                {libelle} +{n}
              </span>
            ))}
            <span className="flex items-center gap-1.5">🃏 Joker : points doublés</span>
            <span className="flex items-center gap-1.5">⭐ Affiche : points triplés</span>
          </div>
        </>
      )}
    </div>
  );
}
