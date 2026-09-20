import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    // Le serveur repond toujours la meme chose, que l'adresse existe ou non :
    // on ne veut pas que cette page serve a savoir qui a un compte.
    try {
      await api.post('/users/forgot-password', { email: email.trim() });
    } catch {
      /* meme en cas d'echec reseau, on affiche la meme chose */
    }
    setSending(false);
    setSent(true);
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <h1 className="font-display text-[24px] font-extrabold leading-none mb-1">
        Mot de passe oublié
      </h1>
      <p className="text-xs italic text-slate-500 mb-5">
        On t’envoie un lien pour en choisir un nouveau
      </p>

      {sent ? (
        <div className="card">
          <p className="text-[38px] leading-none mb-3 text-center">📬</p>
          <p className="text-[13.5px] text-slate-400 leading-relaxed text-center">
            Si un compte existe avec cette adresse, un lien vient de partir. Il est valable une
            heure. Pense à regarder dans les indésirables.
          </p>
          <div className="text-center mt-5">
            <Link to="/login" className="btn-primary text-[13.5px] inline-block">
              Retour à la connexion
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="card">
          <label className="block text-[12.5px] text-slate-400 mb-2">Ton adresse e-mail</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ton.adresse@exemple.fr"
            className="w-full bg-slate-950 border-[1.5px] border-slate-800 rounded-md px-3 py-2
                       text-[14px] text-white placeholder:text-slate-600
                       focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/25 transition-colors"
          />
          <button type="submit" disabled={sending} className="btn-primary text-[13.5px] w-full mt-4">
            {sending ? 'Envoi…' : 'Envoyer le lien'}
          </button>
          <p className="text-center mt-4">
            <Link to="/login" className="text-[13px] text-slate-500 hover:text-amber-500 transition-colors">
              Revenir à la connexion
            </Link>
          </p>
        </form>
      )}
    </div>
  );
}
