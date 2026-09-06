import { useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import api from '../api/client';

function ScoreInput({ value, onChange, disabled }) {
  return (
    <input
      type="number"
      min="0"
      max="150"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      disabled={disabled}
      className="w-14 text-center text-xl font-bold bg-slate-800 border border-slate-600 rounded-lg py-2 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white"
    />
  );
}

function PointsBadge({ points }) {
  if (points === null || points === undefined) return null;
  const config = {
    3: { bg: 'bg-green-500', label: '🎯 Score exact (+3)' },
    2: { bg: 'bg-blue-500', label: '✅ Bon vainqueur (+2)' },
    1: { bg: 'bg-slate-500', label: '✅ Bon vainqueur (+1)' },
    0: { bg: 'bg-red-900/60', label: '❌ Raté (0)' },
  };
  const c = config[points] || config[0];
  return (
    <span className={`${c.bg} text-white text-xs font-bold px-2 py-0.5 rounded-full`}>
      {c.label}
    </span>
  );
}

export default function MatchCard({ match, onPredictionSaved }) {
  const prediction = match.predictions?.[0];
  const isFinished = match.status === 'FINISHED';
  const isPast = new Date() >= new Date(match.kickoff);
  const locked = isPast || isFinished;

  const [home, setHome] = useState(prediction?.homeScorePred ?? '');
  const [away, setAway] = useState(prediction?.awayScorePred ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (home === '' || away === '') return;
    setSaving(true);
    setError('');
    try {
      await api.post('/predictions', {
        matchId: match.id,
        homeScorePred: home,
        awayScorePred: away,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onPredictionSaved?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const kickoffDate = new Date(match.kickoff);
  const dateStr = format(kickoffDate, 'EEE d MMM · HH:mm', { locale: fr });

  return (
    <div className={`card transition-all ${isFinished ? 'border-slate-700' : 'hover:border-slate-600'}`}>
      {/* Infos match */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-slate-500">{dateStr}</span>
        {isFinished && (
          <span className="text-xs bg-green-900/50 text-green-400 px-2 py-0.5 rounded-full">Terminé</span>
        )}
        {!isFinished && locked && (
          <span className="text-xs bg-red-900/50 text-red-400 px-2 py-0.5 rounded-full">🔒 Clôturé</span>
        )}
        {!locked && (
          <span className="text-xs bg-amber-900/50 text-amber-400 px-2 py-0.5 rounded-full">Ouvert</span>
        )}
      </div>

      {/* Équipes + scores */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Équipe domicile */}
        <div className="flex-1 text-right">
          <p className="font-bold text-sm sm:text-base leading-tight">{match.homeTeam.name}</p>
          <p className="text-xs text-slate-500">{match.homeTeam.city}</p>
        </div>

        {/* Scores */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {isFinished ? (
            <>
              <span className="text-2xl font-black text-white">{match.homeScore}</span>
              <span className="text-slate-500">–</span>
              <span className="text-2xl font-black text-white">{match.awayScore}</span>
            </>
          ) : (
            <>
              <ScoreInput value={home} onChange={setHome} disabled={locked} />
              <span className="text-slate-500 font-bold">–</span>
              <ScoreInput value={away} onChange={setAway} disabled={locked} />
            </>
          )}
        </div>

        {/* Équipe extérieure */}
        <div className="flex-1">
          <p className="font-bold text-sm sm:text-base leading-tight">{match.awayTeam.name}</p>
          <p className="text-xs text-slate-500">{match.awayTeam.city}</p>
        </div>
      </div>

      {/* Pronostic soumis / points */}
      {isFinished && prediction && (
        <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between">
          <span className="text-sm text-slate-400">
            Ton pronostic : <span className="text-white font-bold">{prediction.homeScorePred} – {prediction.awayScorePred}</span>
          </span>
          <PointsBadge points={prediction.points} />
        </div>
      )}

      {/* Bouton sauvegarder */}
      {!locked && (
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving || home === '' || away === ''}
            className="btn-primary text-sm py-1.5 px-4"
          >
            {saving ? '...' : saved ? '✅ Sauvegardé !' : prediction ? 'Modifier' : 'Valider'}
          </button>
          {prediction && !saving && !saved && (
            <span className="text-xs text-slate-500">
              Actuel : {prediction.homeScorePred}–{prediction.awayScorePred}
            </span>
          )}
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>
      )}

      {locked && !isFinished && prediction && (
        <div className="mt-2 text-sm text-slate-400">
          Pronostic enregistré : <span className="text-white font-bold">{prediction.homeScorePred} – {prediction.awayScorePred}</span>
        </div>
      )}
    </div>
  );
}
