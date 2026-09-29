import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ChampMotDePasse from '../components/ChampMotDePasse';

/**
 * Le joueur qui tend la main.
 *
 * L'image de l'inscription n'est pas celle de la connexion, et ce n'est pas
 * pour faire joli : une page ou l'on cree son compte est une invitation, une
 * page ou l'on revient est des retrouvailles. Un seul joueur, la main tendue,
 * dit la premiere ; la bande au complet dit la seconde.
 *
 * Detouree comme l'autre, donc posee sur le fond de la page et juste sur les
 * deux themes, halo retire.
 */
function Bandeau() {
  return (
    <div aria-hidden="true" className="text-center">
      <img
        src="/joueur-400.webp"
        srcSet="/joueur-400.webp 400w, /joueur-600.webp 600w, /joueur-900.webp 900w"
        sizes="(min-width: 480px) 260px, 70vw"
        alt=""
        width={260}
        height={307}
        decoding="async"
        className="inline-block w-[70%] max-w-[260px] h-auto"
        style={{ aspectRatio: '0.848' }}
      />
    </div>
  );
}

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
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <Bandeau />

        <div className="text-center mb-5">
          <h1 className="font-display text-[30px] font-extrabold leading-none">Rejoins la bande</h1>
          <p className="text-[13px] text-slate-400 mt-1.5">
            Une adresse, un pseudo, et tu pronostiques dès la prochaine journée.
          </p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="pseudo" className="block text-sm text-slate-400 mb-1">Ton pseudo</label>
              <input
                id="pseudo"
                type="text"
                name="username"
                autoComplete="username"
                className="input"
                placeholder="Comment on t'appelle"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required minLength={3} maxLength={20}
              />
            </div>
            <div>
              <label htmlFor="courriel" className="block text-sm text-slate-400 mb-1">Ton adresse</label>
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
                placeholder="prenom@exemple.fr"
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
              <label htmlFor="motdepasse" className="block text-sm text-slate-400 mb-1">Ton mot de passe</label>
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
              {loading ? 'Un instant…' : 'Créer mon compte'}
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
