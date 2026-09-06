import { useState, useEffect } from 'react';
import api from '../api/client';

export default function AdminPage() {
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

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-2xl font-bold">⚙️ Administration</h1>

      {message && (
        <div className={`p-3 rounded-lg text-sm font-medium ${message.startsWith('✅') ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
          {message}
        </div>
      )}

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
