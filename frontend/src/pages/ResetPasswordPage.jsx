import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';

const MIN = 8;

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('Les deux mots de passe diffèrent');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.post('/users/reset-password', { token, newPassword: password });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Réinitialisation impossible');
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="card text-center">
          <p className="text-[38px] leading-none mb-3">⚠️</p>
          <h1 className="font-display text-[22px] font-extrabold mb-2">Lien incomplet</h1>
          <p className="text-[13.5px] text-slate-400">Il manque le jeton dans l’adresse.</p>
          <Link to="/mot-de-passe-oublie" className="btn-primary text-[13.5px] inline-block mt-5">
            Demander un nouveau lien
          </Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="card text-center">
          <p className="text-[38px] leading-none mb-3">✅</p>
          <h1 className="font-display text-[22px] font-extrabold mb-2">Mot de passe changé</h1>
          <p className="text-[13.5px] text-slate-400">Tu peux te connecter avec le nouveau.</p>
          <Link to="/login" className="btn-primary text-[13.5px] inline-block mt-5">
            Se connecter
          </Link>
        </div>
      </div>
    );
  }

  const field =
    'w-full bg-slate-950 border-[1.5px] border-slate-800 rounded-md px-3 py-2 ' +
    'text-[14px] text-white placeholder:text-slate-600 ' +
    'focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/25 transition-colors';

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <h1 className="font-display text-[24px] font-extrabold leading-none mb-1">
        Nouveau mot de passe
      </h1>
      <p className="text-xs italic text-slate-500 mb-5">{MIN} caractères minimum</p>

      <form onSubmit={submit} className="card">
        <div className="space-y-2">
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Nouveau mot de passe"
            className={field}
          />
          <input
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Répète-le"
            className={field}
          />
        </div>

        {error && <p className="text-[12.5px] text-red-400 mt-3">{error}</p>}

        <button
          type="submit"
          disabled={busy || password.length < MIN || !confirm}
          className="btn-primary text-[13.5px] w-full mt-4"
        >
          {busy ? 'Enregistrement…' : 'Changer mon mot de passe'}
        </button>

        <p className="text-[11px] italic text-slate-600 mt-4 leading-relaxed">
          Le lien ne vaut qu’une heure et ne sert qu’une fois. S’il a expiré,
          <Link to="/mot-de-passe-oublie" className="text-slate-500 hover:text-amber-500 transition-colors"> demande-en un nouveau</Link>.
        </p>
      </form>
    </div>
  );
}
