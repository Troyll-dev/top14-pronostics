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

/**
 * Le choix du joker de la journée.
 *
 * Trois règles de jeu se lisent directement dans la liste, plutôt que d'être
 * rappelées en texte : le match de la semaine n'y figure pas du tout (le joker
 * y est interdit, il est déjà multiplié par trois pour tout le monde), les
 * rencontres commencées sont désactivées, et les matchs sans pronostic
 * enregistré le sont aussi — un joker se pose sur un pari, pas sur une case
 * vide.
 *
 * Quand le joker est déjà engagé sur une rencontre commencée, c'est le
 * sélecteur entier qui se verrouille : il ne peut plus bouger, et c'est ce qui
 * donne au joker son poids. Sans cette règle on le poserait sur le match de
 * 14h30, on regarderait le score, et on le déplacerait si ça tourne mal.
 */
function SelecteurJoker({ matches, regles, onChange, erreur }) {
  const pose = matches.find((m) => m.id === regles.jokerMatchId) || null;
  const engage = !!pose && new Date(pose.kickoff) <= new Date();

  const choix = matches
    .filter((m) => m.id !== regles.afficheMatchId)
    .map((m) => ({
      m,
      commence: new Date(m.kickoff) <= new Date(),
      sansProno: !m.predictions?.[0],
    }));

  return (
    <div className="mt-4 pt-4 border-t border-slate-800">
      <label className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="font-display text-[11.5px] font-bold uppercase tracking-wider text-slate-500">
          🃏 Mon joker de la journée
        </span>

        <select
          value={regles.jokerMatchId ?? ''}
          disabled={engage}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className="flex-1 min-w-[220px] h-9 px-2 rounded-md text-[13px]
                     bg-slate-950 border-[1.5px] border-slate-800 text-white
                     focus:outline-none focus:border-violet-600 focus:ring-2 focus:ring-violet-600/25
                     disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <option value="">— aucun —</option>
          {choix.map(({ m, commence, sansProno }) => (
            <option key={m.id} value={m.id} disabled={commence || sansProno}>
              {m.homeTeam.name} – {m.awayTeam.name}
              {commence ? '  (commencé)' : sansProno ? '  (pronostic à enregistrer)' : ''}
            </option>
          ))}
        </select>
      </label>

      <p className="text-[11.5px] text-slate-500 mt-2">
        {engage
          ? `Ton joker est engagé sur ${pose.homeTeam.name} – ${pose.awayTeam.name} : la rencontre a commencé, il n'est plus déplaçable.`
          : regles.jokerMatchId
          ? 'Tes points sur cette rencontre seront doublés. Tu peux encore le déplacer jusqu\'au coup d\'envoi.'
          : 'Un seul joker par journée : il double tes points sur la rencontre choisie.'}
      </p>

      {erreur && <p className="text-[11.5px] text-red-400 mt-1.5">{erreur}</p>}
    </div>
  );
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

  /**
   * L'état des règles de la journée : multiplicateurs actifs, quel match est
   * l'affiche, et où est mon joker.
   *
   * Il vient du serveur et n'est pas recalculé ici, alors que le navigateur
   * aurait tout ce qu'il faut pour le faire. C'est délibéré : la règle du
   * « match qui commence le plus tard » et son gel au premier coup d'envoi
   * existeraient alors en deux exemplaires, et deux implémentations d'une même
   * règle finissent toujours par diverger — l'écran afficherait une affiche et
   * le calcul en compterait une autre.
   */
  const [regles, setRegles] = useState(null);
  const [jokerErreur, setJokerErreur] = useState('');

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

  const fetchRegles = useCallback(() => {
    if (!currentRound) return;
    api.get(`/predictions/round/${currentRound}/regles`)
      .then((res) => setRegles(res.data))
      // Les règles ne sont qu'un habillage : si l'appel échoue, la page reste
      // utilisable pour ce qui compte, c'est-à-dire pronostiquer.
      .catch(() => setRegles(null));
  }, [currentRound]);

  useEffect(() => { fetchMatches(); }, [fetchMatches]);
  useEffect(() => { fetchRegles(); }, [fetchRegles]);
  useEffect(() => { setBulkResult(null); setJokerErreur(''); }, [currentRound]);

  /**
   * Poser, déplacer ou retirer le joker — un seul geste pour les trois.
   *
   * On relit ensuite les matchs et les règles plutôt que de deviner le nouvel
   * état : le serveur peut avoir refusé, ou avoir déplacé le joker depuis un
   * autre match. Deux requêtes de plus sur un clic rare, contre un écran qui
   * ment.
   */
  /**
   * Poser, déplacer ou retirer le joker.
   *
   * Le serveur expose une bascule sur un match : l'appeler sur la rencontre où
   * le joker se trouve déjà l'enlève. « Aucun » se traduit donc par une bascule
   * sur le joker en place — et ne fait rien s'il n'y en a pas.
   *
   * On relit ensuite les matchs et les règles plutôt que de deviner le nouvel
   * état : le serveur peut avoir refusé, ou avoir déplacé le joker depuis une
   * autre rencontre. Deux requêtes de plus sur un geste rare, contre un écran
   * qui ment.
   */
  const choisirJoker = useCallback(async (matchId) => {
    const cible = matchId ?? regles?.jokerMatchId ?? null;
    if (cible == null) return;

    setJokerErreur('');
    try {
      await api.post('/predictions/joker', { matchId: cible });
      fetchMatches();
      fetchRegles();
    } catch (err) {
      setJokerErreur(err.response?.data?.error || 'Impossible de poser le joker');
      // L'écran affichait la valeur choisie alors que le serveur l'a refusée :
      // on le remet sur l'état réel.
      fetchRegles();
    }
  }, [fetchMatches, fetchRegles, regles]);

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
                {/* Sur le barème (`basePoints`), jamais sur le total : un score
                    exact joué en joker vaut 6 et ne serait plus compté ici.
                    Le repli sur `points` couvre les pronostics d'avant les
                    multiplicateurs, où les deux valeurs étaient égales. */}
                {matches.filter((m) => {
                  const p = m.predictions?.[0];
                  return m.status === 'FINISHED' && p && (p.basePoints ?? p.points) === 3;
                }).length}
              </p>
              <p className="text-[10.5px] uppercase tracking-wide text-slate-500 mt-1.5">Scores exacts</p>
            </div>
          </div>

          {/* Le joker de la journée : un seul sélecteur, ici.

              Il y avait une case à cocher sur chacune des sept cartes — sept
              contrôles pour une décision qui ne se prend qu'une fois par
              journée. Il fallait alors expliquer partout qu'en cocher un en
              décochait un autre.

              Une liste déroulante n'a qu'une valeur : l'exclusivité devient
              structurellement impossible à violer, il n'y a plus rien à
              expliquer. Le retrait est une entrée comme une autre au lieu d'un
              geste à deviner. Et c'est visible sans dérouler la page, ce qui
              était le reproche initial.

              Les rencontres déjà commencées restent dans la liste, désactivées
              et annotées : la règle se voit, au lieu de se découvrir par un
              message d'erreur après coup. */}
          {regles?.actif && <SelecteurJoker
            matches={matches}
            regles={regles}
            onChange={choisirJoker}
            erreur={jokerErreur}
          />}
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
              regles={regles}
            />
          ))}
        </div>
      )}

    </div>
  );
}
