import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import MatchCard from '../components/MatchCard';
import { matchState, useNow } from '../utils/matchState';

const DRAFT_KEY = 't14-brouillons';
const DRAFT_TTL = 30 * 24 * 3600 * 1000; // un mois

/** Brouillons enregistres dans le navigateur, purges des entrees trop vieilles. */
function loadDrafts() {
  try {
    const raw = JSON.parse(localStorage.getItem(DRAFT_KEY)) || {};
    const now = Date.now();
    const kept = {};
    const vide = (x) => x === '' || x === undefined || x === null;
    for (const [id, d] of Object.entries(raw)) {
      if (!d || typeof d !== 'object') continue;
      if (now - (d.t || 0) >= DRAFT_TTL) continue;
      // Purge des brouillons vides deja enregistres par les versions
      // precedentes : ce sont eux qui masquaient des pronostics existants.
      if (vide(d.home) && vide(d.away)) continue;
      kept[id] = d;
    }
    return kept;
  } catch {
    // navigation privee ou stockage bloque : on repart simplement de zero
    return {};
  }
}

export default function MatchesPage() {
  const [rounds, setRounds] = useState([]);
  const [currentRound, setCurrentRound] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  // Horloge : fait basculer « ouvert » en « en cours » sans rechargement
  const now = useNow(60000);

  const [drafts, setDrafts] = useState(loadDrafts);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  useEffect(() => {
    api.get('/matches/rounds').then((res) => setRounds(res.data)).catch(console.error);
    api.get('/matches/next-round').then((res) => setCurrentRound(res.data.round)).catch(console.error);
  }, []);

  // Sauvegarde automatique a chaque frappe
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
    } catch {
      // stockage indisponible : les brouillons restent valables pour la session
    }
  }, [drafts]);

  const fetchMatches = useCallback(() => {
    if (!currentRound) return;
    setLoading(true);
    api.get(`/matches?round=${currentRound}`)
      .then((res) => setMatches(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [currentRound]);

  useEffect(() => { fetchMatches(); }, [fetchMatches]);
  useEffect(() => { setBulkResult(null); }, [currentRound]);

  /**
   * Le brouillon suit la frappe, y compris quand on efface.
   *
   * On avait tente de supprimer l'entree des que les deux champs etaient
   * vides, pour empecher un brouillon vide de masquer un pronostic
   * enregistre. C'etait le bon objectif mais le mauvais endroit : effacer ses
   * deux chiffres pour en saisir d'autres faisait disparaitre le brouillon, la
   * carte retombait sur le pronostic en base, et les anciens chiffres
   * revenaient sous les doigts. On ne pouvait plus modifier un prono.
   *
   * Les deux besoins ne sont pas en conflit, ils ne vivent simplement pas au
   * meme moment : pendant la saisie, un champ vide doit rester vide ; au
   * chargement de la page, un brouillon vide n'a plus aucun sens et ne doit
   * pas masquer ce qui est enregistre. La purge se fait donc dans loadDrafts,
   * et nulle part ailleurs.
   */
  const setDraft = useCallback((matchId, side, value) => {
    setDrafts((prev) => ({
      ...prev,
      [matchId]: { ...prev[matchId], [side]: value, t: Date.now() },
    }));
  }, []);

  /**
   * Apres une validation on remplace le pronostic du seul match concerne, et
   * on oublie son brouillon. Surtout ne pas rappeler fetchMatches ici : il
   * repasse loading a vrai, ce qui demonte toute la liste et effacerait les
   * scores saisis mais pas encore valides sur les autres matchs.
   */
  const handleSaved = useCallback((matchId, prediction) => {
    setMatches((prev) =>
      prev.map((m) => (m.id === matchId ? { ...m, predictions: [prediction] } : m))
    );
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[matchId];
      return next;
    });
  }, []);

  const hasPrediction = (m) => m.predictions?.length > 0;
  const isOpen = (m) => matchState(m, now) === 'avenir';
  const pending = matches.filter((m) => isOpen(m) && !hasPrediction(m));

  // Matchs ouverts dont le brouillon est complet et differe de ce qui est enregistre
  const toSave = matches.filter((m) => {
    if (!isOpen(m)) return false;
    const d = drafts[m.id];
    if (!d || d.home === '' || d.home === undefined || d.away === '' || d.away === undefined) return false;
    const p = m.predictions?.[0];
    return !p || p.homeScorePred !== d.home || p.awayScorePred !== d.away;
  });

  const saveAll = async () => {
    setBulkSaving(true);
    setBulkResult(null);
    let ok = 0;
    const failed = [];

    // En serie plutot qu'en parallele : sept requetes, et les erreurs restent lisibles
    for (const m of toSave) {
      const d = drafts[m.id];
      try {
        const res = await api.post('/predictions', {
          matchId: m.id,
          homeScorePred: d.home,
          awayScorePred: d.away,
        });
        handleSaved(m.id, res.data);
        ok++;
      } catch (err) {
        failed.push(
          `${m.homeTeam.shortName}–${m.awayTeam.shortName} : ${err.response?.data?.error || 'erreur'}`
        );
      }
    }

    setBulkSaving(false);
    setBulkResult({ ok, failed });
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h1 className="font-display text-[26px] font-extrabold leading-none">
          Journée <span className="text-amber-500">{currentRound ?? '—'}</span>
        </h1>
        {pending.length > 0 && (
          <span className="font-display text-xs font-bold chip-accent px-2.5 py-1 rounded whitespace-nowrap">
            {pending.length} à faire
          </span>
        )}
      </div>
      <p className="text-xs italic text-slate-500 mb-5">Saison 2026-2027 · Championnat de France</p>

      {/* Sélecteur de journée */}
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

      {/* Récapitulatif */}
      {!loading && matches.length > 0 && (
        <div className="card mb-5">
          <h3 className="rule-label mb-4">Récapitulatif</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="font-display text-[27px] font-extrabold leading-none tabular-nums text-amber-500">
                {matches.filter(hasPrediction).length}/{matches.length}
              </p>
              <p className="text-[10.5px] uppercase tracking-wide text-slate-500 mt-1.5">Pronostics</p>
            </div>
            <div>
              <p className="font-display text-[27px] font-extrabold leading-none tabular-nums text-green-400">
                {matches
                  .filter((m) => m.status === 'FINISHED')
                  .reduce((sum, m) => sum + (m.predictions?.[0]?.points || 0), 0)}
              </p>
              <p className="text-[10.5px] uppercase tracking-wide text-slate-500 mt-1.5">Points</p>
            </div>
            <div>
              <p className="font-display text-[27px] font-extrabold leading-none tabular-nums text-blue-400">
                {matches.filter((m) => m.status === 'FINISHED' && m.predictions?.[0]?.points === 3).length}
              </p>
              <p className="text-[10.5px] uppercase tracking-wide text-slate-500 mt-1.5">Scores exacts</p>
            </div>
          </div>
        </div>
      )}

      {/* Tout valider — place AVANT la liste, et c'est tout l'objet du
          changement. En dessous des sept matchs, il fallait faire defiler
          toute la page pour le decouvrir : autant dire que personne ne le
          voyait, et qu'on pouvait quitter la page en croyant avoir joue. */}
      {!loading && (toSave.length > 0 || bulkResult) && (
        <div className="card mb-5 border-l-4 border-l-amber-500">
          {toSave.length > 0 ? (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="font-display font-bold text-[15px]">
                  {toSave.length} prono{toSave.length > 1 ? 's' : ''} en attente
                </p>
                <p className="text-[12px] text-slate-500 mt-0.5">
                  Saisis mais pas encore envoyés. Ils sont conservés dans ce navigateur.
                </p>
              </div>
              <button onClick={saveAll} disabled={bulkSaving} className="btn-primary text-[13.5px] shrink-0">
                {bulkSaving ? 'Envoi…' : 'Tout valider'}
              </button>
            </div>
          ) : (
            <p className="font-display font-bold text-[15px] text-green-400">
              ✅ Tous tes pronos sont enregistrés
            </p>
          )}

          {bulkResult && (
            <div className="mt-3 pt-3 border-t border-slate-800 text-[12.5px]">
              {bulkResult.ok > 0 && (
                <p className="text-green-400">
                  {bulkResult.ok} prono{bulkResult.ok > 1 ? 's' : ''} enregistré{bulkResult.ok > 1 ? 's' : ''}
                </p>
              )}
              {bulkResult.failed.length > 0 && (
                <div className="mt-1 text-red-400">
                  <p>{bulkResult.failed.length} en échec :</p>
                  <ul className="mt-0.5 space-y-0.5">
                    {bulkResult.failed.map((f, i) => <li key={i}>· {f}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Liste des matchs */}
      {loading ? (
        <div className="text-center py-16 text-slate-500 animate-pulse">Chargement des matchs…</div>
      ) : matches.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-500 text-lg mb-2">Aucun match pour la journée {currentRound}</p>
          <p className="text-slate-600 text-sm">Les matchs seront ajoutés prochainement</p>
        </div>
      ) : (
        <div className="space-y-3">
          {matches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              draft={drafts[match.id]}
              now={now}
              onDraftChange={setDraft}
              onPredictionSaved={handleSaved}
            />
          ))}
        </div>
      )}

    </div>
  );
}
