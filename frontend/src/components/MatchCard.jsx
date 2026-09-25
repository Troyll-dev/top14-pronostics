import { useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import TeamCrest from './TeamCrest';
import { matchState, STATE, STATE_CHIP } from '../utils/matchState';

function ScoreInput({ value, onChange, disabled }) {
  return (
    <input
      type="number"
      min="0"
      max="150"
      value={value}
      // On laisse passer la chaine vide : convertir tout de suite afficherait
      // un 0 des que l'on efface le champ.
      onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      disabled={disabled}
      className="w-[52px] h-11 text-center font-display text-xl font-bold tabular-nums
                 bg-slate-950 border-[1.5px] border-slate-800 rounded-md text-white
                 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/25
                 disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
    />
  );
}

const POINTS = {
  3: { cls: 'bg-green-500 text-slate-950', label: '🎯 Score exact +3' },
  2: { cls: 'bg-amber-500/20 text-amber-400 border border-amber-500/45', label: '✅ Bon vainqueur +2' },
  1: { cls: 'bg-slate-700/40 text-slate-400 border border-slate-700', label: '✅ Bon vainqueur +1' },
  0: { cls: 'bg-slate-800/60 text-slate-500 border border-slate-800', label: '❌ Raté 0' },
};

function PointsBadge({ points }) {
  if (points === null || points === undefined) return null;
  const c = POINTS[points] || POINTS[0];
  return (
    <span className={`font-display text-[10.5px] font-bold uppercase tracking-wider px-2.5 py-1 rounded whitespace-nowrap ${c.cls}`}>
      {c.label}
    </span>
  );
}

function PointsChip({ points }) {
  if (points === null || points === undefined) return null;
  const cls = {
    3: 'bg-green-500 text-slate-950',
    2: 'bg-amber-500/20 text-amber-400',
    1: 'bg-slate-700/45 text-slate-400',
    0: 'bg-slate-800/60 text-slate-500',
  }[points] || 'bg-slate-800/60 text-slate-500';
  return (
    <span className={`font-display text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${cls}`}>
      +{points}
    </span>
  );
}

/**
 * Les scores saisis ne vivent plus dans cette carte mais dans MatchesPage,
 * qui les sauvegarde dans le navigateur et sait tout valider d'un coup.
 * La carte est donc pilotee par `draft` et remonte chaque frappe.
 */
export default function MatchCard({ match, draft, onDraftChange, onPredictionSaved, now = Date.now() }) {
  const { user } = useAuth();
  const prediction = match.predictions?.[0];
  const state = matchState(match, now);
  const isFinished = state === 'termine';
  const locked = state !== 'avenir';

  // Un brouillon a la priorite sur ce qui est enregistre ; sinon on repart du
  // pronostic en base, sinon du vide.
  const home = draft?.home ?? prediction?.homeScorePred ?? '';
  const away = draft?.away ?? prediction?.awayScorePred ?? '';
  const complete = home !== '' && away !== '';
  const dirty =
    complete &&
    (!prediction || prediction.homeScorePred !== home || prediction.awayScorePred !== away);

  /**
   * Trois etats, et un seul mot pour les dire.
   *
   * Avant, tous les matchs ouverts portaient le meme liseré orange et la meme
   * etiquette « Ouvert ». Un signal present partout ne signale rien : on ne
   * distinguait pas un prono enregistre d'un prono seulement saisi, et l'on
   * pouvait remplir ses sept matchs, oublier de valider, et le decouvrir au
   * classement.
   *
   * Desormais l'orange est reserve a ce qui demande une action.
   */
  const etat = dirty
    ? { libelle: 'non validé', chip: 'bg-amber-500/20 text-amber-500 border border-amber-500/45' }
    : prediction
    ? { libelle: 'enregistré', chip: 'bg-green-500/15 text-green-400 border border-green-500/40' }
    : { libelle: 'à faire', chip: 'chip-accent' };

  const bordure = locked
    ? ''
    : dirty
    ? 'border-l-4 border-l-amber-500'
    : prediction
    ? 'border-l-4 border-l-green-500/70'
    : 'border-l-4 border-l-slate-600';

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const [showOthers, setShowOthers] = useState(false);
  const [others, setOthers] = useState(null);
  const [loadingOthers, setLoadingOthers] = useState(false);

  const toggleOthers = async () => {
    const opening = !showOthers;
    setShowOthers(opening);
    if (opening && others === null) {
      setLoadingOthers(true);
      try {
        const res = await api.get(`/predictions/match/${match.id}`);
        setOthers(res.data);
      } catch {
        setOthers([]);
      } finally {
        setLoadingOthers(false);
      }
    }
  };

  const handleSave = async () => {
    if (!complete) return;
    setSaving(true);
    setError('');
    try {
      const res = await api.post('/predictions', {
        matchId: match.id,
        homeScorePred: home,
        awayScorePred: away,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setOthers(null);
      onPredictionSaved?.(match.id, res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const dateStr = format(new Date(match.kickoff), "EEEE d MMMM · HH'h'mm", { locale: fr });
  const homeWon = isFinished && match.homeScore > match.awayScore;
  const awayWon = isFinished && match.awayScore > match.homeScore;

  return (
    <div className={`card stitched laced ${bordure}`}>
      {/* En-tête

          Date, heure et diffuseur sur la même ligne, à gauche : ce sont les
          trois réponses à la même question — quand, et sur quelle chaîne. Le
          groupe peut passer à la ligne sur les petits écrans plutôt que de
          pousser l'étiquette d'état hors du cadre.

          Le diffuseur ne s'affiche qu'avant le coup d'envoi. Après, savoir sur
          quelle chaîne le match a été diffusé n'apprend plus rien, et la place
          revient au score. */}
      <div className="relative z-10 flex items-center justify-between gap-2 flex-wrap mb-3">
        <span className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className="text-[11.5px] italic text-slate-500 first-letter:uppercase">{dateStr}</span>
          {match.broadcaster && state === 'avenir' && (
            <span
              title={`Diffusion : ${match.broadcaster}`}
              className="font-display text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded
                         bg-slate-700/40 text-slate-400 border border-slate-700 whitespace-nowrap"
            >
              📺 {match.broadcaster}
            </span>
          )}
        </span>
        {state === 'avenir' ? (
          <span className={`font-display text-[10.5px] font-bold uppercase tracking-wider px-2.5 py-1 rounded ${etat.chip}`}>
            {etat.libelle}
          </span>
        ) : (
          <span className={`font-display text-[10.5px] font-bold uppercase tracking-wider px-2.5 py-1 rounded flex items-center gap-1.5 ${STATE_CHIP[state]}`}>
            {state === 'encours' && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
            {STATE[state].label}
          </span>
        )}
      </div>

      {/* Affiche */}
      <div className="relative z-10 flex items-center gap-2.5 sm:gap-4">
        <div className="flex-1 min-w-0 flex items-center justify-end gap-2.5">
          <div className="min-w-0 text-right">
            <p className="font-display font-bold text-[15.5px] leading-tight truncate">{match.homeTeam.name}</p>
            <p className="text-[10.5px] italic text-slate-500 mt-0.5 truncate">{match.venue || match.homeTeam.city}</p>
          </div>
          <TeamCrest team={match.homeTeam} size={28} />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isFinished ? (
            <>
              <span className={`font-display font-extrabold text-[29px] leading-none tabular-nums ${homeWon ? 'text-amber-400' : ''}`}>
                {match.homeScore}
              </span>
              <span className="text-slate-500 text-base">–</span>
              <span className={`font-display font-extrabold text-[29px] leading-none tabular-nums ${awayWon ? 'text-amber-400' : ''}`}>
                {match.awayScore}
              </span>
            </>
          ) : (
            <>
              <ScoreInput value={home} onChange={(v) => onDraftChange(match.id, 'home', v)} disabled={locked} />
              <span className="text-slate-500 text-base">–</span>
              <ScoreInput value={away} onChange={(v) => onDraftChange(match.id, 'away', v)} disabled={locked} />
            </>
          )}
        </div>

        <div className="flex-1 min-w-0 flex items-center gap-2.5">
          <TeamCrest team={match.awayTeam} size={28} />
          <div className="min-w-0">
            <p className="font-display font-bold text-[15.5px] leading-tight truncate">{match.awayTeam.name}</p>
            <p className="text-[10.5px] italic text-slate-500 mt-0.5 truncate">{match.awayTeam.city}</p>
          </div>
        </div>
      </div>

      {/* Ton pronostic + points */}
      {isFinished && prediction && (
        <div className="relative z-10 mt-3.5 pt-3 border-t border-slate-800 flex items-center justify-between gap-2.5">
          <span className="text-[12.5px] text-slate-400">
            Ton pronostic{' '}
            <b className="font-display text-sm text-white">
              {prediction.homeScorePred} – {prediction.awayScorePred}
            </b>
          </span>
          <PointsBadge points={prediction.points} />
        </div>
      )}

      {/* Saisie */}
      {!locked && (
        <div className="relative z-10 mt-3.5 pt-3 border-t border-slate-800 flex items-center gap-3 flex-wrap">
          {/* Le bouton ne s'affiche que s'il a quelque chose a faire.

              Il portait « Modifier » en grise tant que rien n'avait change.
              L'etiquette promettait une action — « clique ici pour modifier » —
              alors qu'elle en decrivait une autre : « enregistrer la
              modification ». On cliquait donc dessus sans effet, et l'on en
              concluait qu'un prono enregistre ne se modifiait plus.

              Un bouton grise qui ne s'explique pas est toujours un piege. Ici
              il disparait, et une phrase dit quoi faire. */}
          {(dirty || !prediction || saving || saved) && (
            <button
              onClick={handleSave}
              disabled={saving || !complete}
              className="btn-primary text-[13px] py-2"
            >
              {saving
                ? '…'
                : saved
                ? '✅ Enregistré'
                : prediction
                ? 'Enregistrer la modification'
                : 'Valider'}
            </button>
          )}

          {dirty && !saving && !saved && (
            <span className="font-display text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded bg-amber-500/20 text-amber-500 border border-amber-500/45">
              non enregistré
            </span>
          )}
          {!dirty && prediction && !saving && !saved && (
            <span className="text-[11.5px] text-slate-500">
              Enregistré&nbsp;: <b className="text-slate-400">{prediction.homeScorePred}–{prediction.awayScorePred}</b>
              {' · '}change un score pour le modifier
            </span>
          )}
          {error && <span className="text-[11.5px] text-red-400">{error}</span>}
        </div>
      )}

      {locked && !isFinished && prediction && (
        <div className="relative z-10 mt-2.5 text-[12.5px] text-slate-400">
          Pronostic enregistré{' '}
          <b className="font-display text-sm text-white">
            {prediction.homeScorePred} – {prediction.awayScorePred}
          </b>
        </div>
      )}

      {/* Pronostics des autres joueurs */}
      <div className="relative z-10 mt-3 pt-3 border-t border-slate-800">
        <button
          onClick={toggleOthers}
          className="flex items-center gap-2 text-xs text-slate-400 hover:text-amber-400 transition-colors"
        >
          <span className={`text-[9px] text-amber-500 transition-transform ${showOthers ? 'rotate-90' : ''}`}>▶</span>
          Pronos des joueurs
          {others && <span className="text-slate-600">({others.length})</span>}
        </button>

        {showOthers && (
          <div className="mt-2.5">
            {loadingOthers ? (
              <p className="text-xs text-slate-600 animate-pulse">Chargement…</p>
            ) : !others || others.length === 0 ? (
              <p className="text-xs text-slate-600">Aucun pronostic pour ce match.</p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {others.map((p, i) => {
                  const isMe = p.user.id === user?.id;
                  return (
                    <li
                      key={p.id}
                      className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] ${
                        isMe
                          ? 'bg-amber-500/10 shadow-[inset_2px_0_0_rgb(var(--a-500))]'
                          : i % 2 === 0
                          ? 'bg-amber-500/[.04]'
                          : ''
                      }`}
                    >
                      <span
                        className="w-[7px] h-[7px] rounded-full shrink-0"
                        style={{ backgroundColor: p.user.avatarColor }}
                      />
                      <span className={`truncate ${isMe ? 'text-amber-400 font-semibold' : 'text-slate-400'}`}>
                        {p.user.username}
                        {isMe && ' (toi)'}
                      </span>
                      <span className="ml-auto font-display font-bold text-[13.5px] tabular-nums shrink-0">
                        {p.homeScorePred} – {p.awayScorePred}
                      </span>
                      <PointsChip points={p.points} />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
