import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ChampMotDePasse from '../components/ChampMotDePasse';

/**
 * Huit caracteres, comme partout ailleurs.
 *
 * Cette page en exigeait six, alors que le changement de mot de passe depuis le
 * profil en demande huit. Un nouveau venu pouvait donc choisir un mot de passe
 * que l'application lui refuserait le jour ou il voudrait le changer — une
 * regle qui n'est pas la meme selon la porte par laquelle on entre finit
 * toujours par surprendre quelqu'un.
 */
const MIN_MOT_DE_PASSE = 8;

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(form.username, form.email, form.password);
      navigate('/');
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.errors?.[0]?.msg || 'Erreur inscription';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">🏉</div>
          <h1 className="text-3xl font-bold text-amber-400">Top 14 Pronos</h1>
          <p className="text-slate-400 mt-1">Rejoins le groupe !</p>
        </div>

        <div className="card">
          <h2 className="text-xl font-semibold mb-6 text-center">Créer un compte</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="pseudo" className="block text-sm text-slate-400 mb-1">Pseudo</label>
              <input
                id="pseudo"
                type="text"
                name="username"
                autoComplete="username"
                className="input"
                placeholder="TonPseudo"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required minLength={3} maxLength={20}
              />
            </div>
            <div>
              <label htmlFor="courriel" className="block text-sm text-slate-400 mb-1">Email</label>
              {/*
                `autoComplete` et `inputMode` declenchent le remplissage
                automatique et, sur telephone, le clavier qui porte l'arobase.
                Deux lignes invisibles qui changent l'usage reel.
              */}
              <input
                id="courriel"
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                className="input"
                placeholder="ton@email.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
              <p className="text-[11.5px] text-slate-500 mt-1.5">
                Les rappels et le bilan du lundi partiront là — et c'est aussi la seule
                façon de récupérer ton mot de passe. Vérifie-la bien.
              </p>
            </div>
            <div>
              <label htmlFor="motdepasse" className="block text-sm text-slate-400 mb-1">Mot de passe</label>
              {/*
                L'oeil plutot qu'un second champ « repete ton mot de passe » :
                taper deux fois ne prouve rien sur ce qu'on a tape, voir ce qu'on
                a ecrit si — et ca n'ajoute pas un champ obligatoire au moment ou
                l'on decide si l'on s'inscrit ou si l'on referme l'onglet.
              */}
              <ChampMotDePasse
                id="motdepasse"
                name="password"
                autoComplete="new-password"
                placeholder={`${MIN_MOT_DE_PASSE} caractères minimum`}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required minLength={MIN_MOT_DE_PASSE}
              />
            </div>
            {error && (
              <p role="alert" className="text-red-400 text-sm">{error}</p>
            )}
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'Inscription...' : "S'inscrire"}
            </button>
          </form>
          <p className="text-center text-slate-400 text-sm mt-4">
            Déjà un compte ?{' '}
            <Link to="/login" className="text-amber-400 hover:underline">Se connecter</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
