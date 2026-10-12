import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';

const dateHeure = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  timeZone: 'Europe/Paris',
});

const jourSeul = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris',
});

/**
 * « Il y a deux heures » plutôt que « mardi 12 nov. à 09:07 ».
 *
 * Pour une date de surveillance, l'âge est l'information utile et la date
 * exacte ne l'est pas : on veut savoir si c'est récent, pas quel jour c'était.
 * La date complète reste dans l'infobulle, pour le jour où on la cherche.
 */
function depuis(iso) {
  if (!iso) return 'jamais';
  const min = Math.round((Date.now() - new Date(iso)) / 60000);
  if (min < 2) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  return `il y a ${j} jour${j > 1 ? 's' : ''}`;
}

/** « il y a 12 min », « il y a 3 h », « il y a 2 jours ». */
function duree(min) {
  if (min == null) return '';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} jours`;
}

/**
 * La pastille d'état.
 *
 * Cinq situations, et deux d'entre elles méritent qu'on s'y arrête.
 *
 * « pas encore passée », en gris : le serveur vient de redémarrer et la tâche
 * n'a pas eu son tour. Après un déploiement à 11 h, les horaires de 6 h 20 sont
 * dans ce cas jusqu'au lendemain matin. Ce n'est pas une panne mais une absence
 * de réponse, et les peindre en rouge toutes les deux ferait d'un écran de
 * surveillance un écran qu'on apprend à ignorer.
 *
 * « actif » sans seuil, en vert pâle : les résultats se taisent légitimement
 * hors saison, donc aucun retard ne leur est reproché. Le dire évite de laisser
 * croire à un contrôle qui n'a pas lieu.
 */
function Pastille({ etat, suivie }) {
  const styles = {
    ok: 'bg-green-500/20 text-green-400 border-green-500/40',
    attente: 'bg-slate-500/20 text-slate-400 border-slate-500/40',
    retard: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    echec: 'bg-red-500/20 text-red-400 border-red-500/40',
    jamais: 'bg-red-500/20 text-red-400 border-red-500/40',
  };
  const mots = {
    ok: suivie ? 'OK' : 'actif',
    attente: 'pas encore passée',
    retard: 'en retard',
    echec: 'en échec',
    jamais: 'jamais vue',
  };
  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${styles[etat]}`}>
      {mots[etat]}
    </span>
  );
}

/**
 * L'état du site : les tâches automatiques et les adresses non confirmées.
 *
 * ---------------------------------------------------------------------------
 * POURQUOI CETTE CARTE EST LA PREMIÈRE DE LA PAGE
 * ---------------------------------------------------------------------------
 *
 * Les deux formulaires du dessous — créer un match, saisir un résultat — ne
 * servent presque jamais : les scores arrivent tout seuls, et une rencontre
 * créée à la main est l'exception. Ce qu'on vient vraiment chercher ici, c'est
 * l'état des choses, en général après avoir reçu l'alerte du matin.
 *
 * ---------------------------------------------------------------------------
 * ELLE NE REMPLACE PAS L'ALERTE
 * ---------------------------------------------------------------------------
 *
 * Et c'est important : une page ne se consulte que lorsqu'on soupçonne déjà un
 * problème. C'est précisément le défaut qui a laissé le bug des statistiques
 * vivre cinq semaines dans les journaux. L'alerte quotidienne vient te
 * chercher ; cette page dit le détail une fois que tu es là.
 */
function EtatDuSite() {
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState('');
  const [simulation, setSimulation] = useState(null);

  useEffect(() => {
    api.get('/admin/sante')
      .then((r) => setData(r.data))
      .catch((e) => setErreur(e.response?.data?.error || 'Lecture impossible'));
  }, []);

  const simuler = async () => {
    setSimulation({ enCours: true });
    try {
      const r = await api.post('/admin/sante/simuler');
      setSimulation(r.data);
    } catch (e) {
      setSimulation({ erreur: e.response?.data?.error || 'Simulation impossible' });
    }
  };

  if (erreur) {
    return (
      <div className="card">
        <h2 className="font-semibold mb-2">État du site</h2>
        <p className="text-red-400 text-sm">{erreur}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card">
        <p className="text-slate-500 text-sm animate-pulse">Lecture de l'état…</p>
      </div>
    );
  }

  const ennuis = data.anomalies.length;

  return (
    <>
      <div className="card">
        <div className="flex items-baseline justify-between gap-3 mb-1">
          <h2 className="font-semibold">Tâches automatiques</h2>
          <span className={`text-[12px] ${ennuis ? 'text-red-400 font-semibold' : 'text-slate-500'}`}>
            {ennuis
              ? `${ennuis} anomalie${ennuis > 1 ? 's' : ''}`
              : 'rien à signaler'}
          </span>
        </div>
        <p className="text-[11.5px] text-slate-500 mb-4">
          Une alerte part chaque matin à 9 h 07, et seulement s'il y a quelque chose à dire.
          Une tâche qui n'a pas encore eu son tour depuis le dernier déploiement n'est pas
          comptée comme une anomalie.
        </p>

        <div className="divide-y divide-slate-800">
          {data.taches.map((t) => (
            <div key={t.job} className="py-2.5 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[13.5px]">{t.libelle}</span>
                  <Pastille etat={t.etat} suivie={t.suivie} />
                </div>
                <p className="text-[12px] text-slate-500 mt-0.5">
                  Dernière réussite{' '}
                  <span title={t.lastSuccessAt ? dateHeure.format(new Date(t.lastSuccessAt)) : ''}>
                    {depuis(t.lastSuccessAt)}
                  </span>
                  {t.suivie && t.seuil !== null && (
                    <span className="text-slate-600"> · seuil {t.seuil} j</span>
                  )}
                  {!t.suivie && (
                    <span className="text-slate-600"> · sans seuil, normal hors saison</span>
                  )}
                  {t.etat === 'attente' && t.suivie && (
                    <span className="text-slate-600">
                      {' '}· serveur redémarré {duree(t.minutesDeMarche)}
                    </span>
                  )}
                </p>
                {t.lastError && (
                  <p className="text-[12px] text-red-400 mt-1 break-words">
                    {t.lastError}
                    <span className="text-slate-600">
                      {' '}({depuis(t.lastErrorAt)})
                    </span>
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button onClick={simuler} className="btn-primary !text-[13px] !py-1.5 !px-3">
            Voir ce que l'alerte dirait
          </button>
          {simulation?.enCours && <span className="text-[12px] text-slate-500">Un instant…</span>}
          {simulation?.erreur && <span className="text-[12px] text-red-400">{simulation.erreur}</span>}
          {simulation && !simulation.enCours && !simulation.erreur && (
            <p className="w-full text-[12.5px] whitespace-pre-wrap text-slate-400 border-l-2 border-slate-700 pl-3">
              {simulation.anomalies?.length
                ? simulation.texte
                : "Rien ne partirait : toutes les tâches sont à jour."}
            </p>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-1">Adresses non confirmées</h2>
        <p className="text-[11.5px] text-slate-500 mb-4">
          Une adresse jamais confirmée peut être fautive — auquel cas ce joueur ne reçoit
          plus aucun courriel, et ne le sait pas.
        </p>

        {data.nonConfirmes.length === 0 ? (
          <p className="text-[13px] text-slate-500">
            Tout le monde a confirmé la sienne.
          </p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {data.nonConfirmes.map((u) => (
              <li key={u.id} className="py-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-[13.5px]">{u.username}</span>
                  {u.enPause && (
                    <span className="rounded-full border border-slate-600 px-2 py-0.5 text-[11px] text-slate-400">
                      en pause
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-slate-500 break-all">
                  {u.email} · inscrit le {jourSeul.format(new Date(u.createdAt))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export default function AdminPage() {
  const { user } = useAuth();
  const [teams, setTeams] = useState([]);
  const [matches, setMatches] = useState([]);
  const [form, setForm] = useState({ homeTeamId: '', awayTeamId: '', kickoff: '', round: '', venue: '' });
  const [resultForm, setResultForm] = useState({ matchId: '', homeScore: '', awayScore: '' });
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.get('/matches/teams').then((r) => setTeams(r.data));
    api.get('/matches').then((r) => setMatches(r.data));
  }, []);

  const notify = (msg) => { setMessage(msg); setTimeout(() => setMessage(''), 3000); };

  const createMatch = async (e) => {
    e.preventDefault();
    try {
      await api.post('/matches', form);
      notify('✅ Match créé !');
      api.get('/matches').then((r) => setMatches(r.data));
    } catch (err) {
      notify('❌ ' + (err.response?.data?.error || 'Erreur'));
    }
  };

  const updateResult = async (e) => {
    e.preventDefault();
    try {
      await api.patch(`/matches/${resultForm.matchId}/result`, {
        homeScore: resultForm.homeScore,
        awayScore: resultForm.awayScore,
      });
      notify('✅ Résultat enregistré et points calculés !');
      api.get('/matches').then((r) => setMatches(r.data));
    } catch (err) {
      notify('❌ ' + (err.response?.data?.error || 'Erreur'));
    }
  };

  const pendingResults = matches.filter((m) => m.status !== 'FINISHED' && new Date() >= new Date(m.kickoff));

  /**
   * L'ecran refuse aussi, mais ce n'est pas lui qui protege.
   *
   * La page etait derriere `PrivateRoute`, qui verifie seulement qu'on est
   * connecte — pas qui on est. N'importe lequel des joueurs pouvait donc y
   * entrer et saisir un resultat, ce qui distribue les points de tout le monde.
   *
   * La vraie fermeture est cote serveur : `requireAdmin` sur les deux routes.
   * Ce garde-ci evite seulement de proposer des formulaires qui seraient
   * refuses a l'envoi — c'est de la politesse, pas de la securite. Le cacher
   * sans fermer l'API n'aurait rien protege du tout.
   */
  if (user && user.admin === false) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h1 className="font-display text-[26px] font-extrabold leading-none mb-2">Réservé à l'administration</h1>
        <p className="text-[14px] text-slate-400 leading-relaxed">
          Cette page sert à créer des matchs et à saisir des résultats. Les scores
          arrivent tout seuls, personne n'a besoin d'y toucher.
        </p>
        <p className="mt-6">
          <Link to="/" className="text-amber-500 hover:underline text-[14px]">Retour au jeu</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-2xl font-bold">⚙️ Administration</h1>

      {message && (
        <div className={`p-3 rounded-lg text-sm font-medium ${message.startsWith('✅') ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
          {message}
        </div>
      )}

      {/* L'état du site, en tête : c'est ce qu'on vient chercher. */}
      <EtatDuSite />

      {/* Créer un match */}
      <div className="card">
        <h2 className="font-semibold mb-4">➕ Ajouter un match</h2>
        <form onSubmit={createMatch} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Équipe domicile</label>
              <select className="input text-sm" value={form.homeTeamId} onChange={(e) => setForm({ ...form, homeTeamId: e.target.value })} required>
                <option value="">Choisir...</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Équipe extérieure</label>
              <select className="input text-sm" value={form.awayTeamId} onChange={(e) => setForm({ ...form, awayTeamId: e.target.value })} required>
                <option value="">Choisir...</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Journée</label>
              <input type="number" min="1" max="26" className="input text-sm" placeholder="1-26" value={form.round} onChange={(e) => setForm({ ...form, round: e.target.value })} required />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Date & heure</label>
              <input type="datetime-local" className="input text-sm" value={form.kickoff} onChange={(e) => setForm({ ...form, kickoff: e.target.value })} required />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Stade (optionnel)</label>
            <input type="text" className="input text-sm" placeholder="Stade Ernest-Wallon" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} />
          </div>
          <button type="submit" className="btn-primary text-sm">Créer le match</button>
        </form>
      </div>

      {/* Saisir un résultat */}
      <div className="card">
        <h2 className="font-semibold mb-4">📝 Saisir un résultat</h2>
        {pendingResults.length === 0 ? (
          <p className="text-slate-500 text-sm">Aucun match en attente de résultat.</p>
        ) : (
          <form onSubmit={updateResult} className="space-y-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Match</label>
              <select className="input text-sm" value={resultForm.matchId} onChange={(e) => setResultForm({ ...resultForm, matchId: e.target.value })} required>
                <option value="">Choisir le match...</option>
                {pendingResults.map((m) => (
                  <option key={m.id} value={m.id}>
                    J{m.round} — {m.homeTeam.shortName} vs {m.awayTeam.shortName}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-xs text-slate-400 mb-1 block">Score domicile</label>
                <input type="number" min="0" className="input text-sm text-center" value={resultForm.homeScore} onChange={(e) => setResultForm({ ...resultForm, homeScore: e.target.value })} required />
              </div>
              <span className="text-slate-500 mt-5">–</span>
              <div className="flex-1">
                <label className="text-xs text-slate-400 mb-1 block">Score extérieur</label>
                <input type="number" min="0" className="input text-sm text-center" value={resultForm.awayScore} onChange={(e) => setResultForm({ ...resultForm, awayScore: e.target.value })} required />
              </div>
            </div>
            <button type="submit" className="btn-primary text-sm">Enregistrer + calculer les points</button>
          </form>
        )}
      </div>

      {/* Stats rapides */}
      <div className="card">
        <h2 className="font-semibold mb-3">📊 Stats</h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xl font-bold text-amber-400">{matches.length}</p>
            <p className="text-xs text-slate-500">Matchs total</p>
          </div>
          <div>
            <p className="text-xl font-bold text-green-400">{matches.filter((m) => m.status === 'FINISHED').length}</p>
            <p className="text-xs text-slate-500">Terminés</p>
          </div>
          <div>
            <p className="text-xl font-bold text-blue-400">{pendingResults.length}</p>
            <p className="text-xs text-slate-500">À saisir</p>
          </div>
        </div>
      </div>
    </div>
  );
}
