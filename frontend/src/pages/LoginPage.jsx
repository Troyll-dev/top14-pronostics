import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ChampMotDePasse from '../components/ChampMotDePasse';

/**
 * La bande, en haut de la page de connexion.
 *
 * Les quatre joueurs en maillots de clubs differents, plutot que la photo du
 * groupe : c'est eux qu'on vient retrouver en se connectant, et les maillots
 * varies disent le championnat sans nommer aucun club.
 *
 * L'image est detouree, donc elle se pose directement sur le fond de la page et
 * suit le theme sans rien faire — ni masque en degrade, ni fond a assortir. Son
 * halo clair d'origine a ete retire : il se voyait nettement sur le theme nuit.
 *
 * `aspect-ratio` reserve la place avant que l'image arrive, pour que le
 * formulaire ne saute pas sous le doigt au moment ou elle finit de charger.
 *
 * Purement decorative : `alt` vide et `aria-hidden`, pour qu'un lecteur d'ecran
 * n'annonce pas une illustration qui n'apprend rien.
 */
function Bandeau() {
  return (
    <div aria-hidden="true" className="text-center mb-1">
      <img
        src="/clubs-600.webp"
        srcSet="/clubs-400.webp 400w, /clubs-600.webp 600w, /clubs-900.webp 900w"
        sizes="(min-width: 480px) 320px, 80vw"
        alt=""
        width={320}
        height={298}
        decoding="async"
        className="inline-block w-full max-w-[320px] h-auto"
        style={{ aspectRatio: '1.074' }}
      />
    </div>
  );
}

/**
 * Le message d'erreur, en francais et sans reproche.
 *
 * L'ancien disait « Identifiants incorrects » quoi qu'il arrive, y compris
 * quand le serveur ne repondait pas — ce qui accuse la personne d'une faute
 * qu'elle n'a pas commise et l'envoie chercher un mot de passe qui etait le
 * bon. Les deux cas se distinguent pourtant tres bien : une reponse du serveur
 * avec un code, ou pas de reponse du tout.
 *
 * On ne dit jamais laquelle des deux valeurs est fausse. Ce n'est pas de la
 * politesse : annoncer « cette adresse n'existe pas » dirait a n'importe qui
 * quelles adresses ont un compte ici.
 */
function messageErreur(err) {
  if (!err?.response) {
    return "Le serveur ne répond pas. Ce n'est pas toi : réessaie dans un instant.";
  }
  if (err.response.status === 401 || err.response.status === 400) {
    return "Adresse ou mot de passe incorrect. Ça arrive — réessaie, ou demande un nouveau mot de passe.";
  }
  return err.response.data?.error || "Quelque chose s'est mal passé de notre côté. Réessaie dans un instant.";
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate('/');
    } catch (err) {
      setError(messageErreur(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <Bandeau />

        <div className="text-center mb-5">
          <h1 className="font-display text-[30px] font-extrabold leading-none">La bande</h1>
          <p className="text-[13px] text-slate-400 mt-1.5">
            Pronostics du Top 14, entre nous. Saison 2026-2027.
          </p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="courriel" className="block text-sm text-slate-400 mb-1">
                Ton adresse
              </label>
              {/*
                `autoComplete` et `inputMode` ne se voient pas, et ce sont
                pourtant les deux lignes qui changent le plus l'usage reel :
                elles declenchent le remplissage automatique du navigateur et,
                sur telephone, font apparaitre le clavier qui porte l'arobase.
                Sans elles, chacun retape son adresse a chaque visite.
              */}
              <input
                id="courriel"
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                autoFocus
                className="input"
                placeholder="prenom@exemple.fr"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>

            <div>
              <label htmlFor="motdepasse" className="block text-sm text-slate-400 mb-1">
                Ton mot de passe
              </label>
              {/* L'oeil, le meme qu'a l'inscription et dans le profil : un seul
                  composant, donc un seul comportement a retenir. */}
              <ChampMotDePasse
                id="motdepasse"
                name="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>

            {/*
              L'erreur est annoncee aux lecteurs d'ecran (`role="alert"`) : sans
              cela, une personne qui n'utilise pas ses yeux valide le formulaire
              et n'apprend jamais qu'il a ete refuse.
            */}
            {error && (
              <p role="alert" className="text-red-400 text-[13px] leading-relaxed">
                {error}
              </p>
            )}

            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'Un instant…' : 'Entrer dans le vestiaire'}
            </button>
          </form>

          <p className="text-center text-slate-400 text-sm mt-4">
            Pas encore de compte ?{' '}
            <Link to="/register" className="text-amber-400 hover:underline">Rejoindre la bande</Link>
          </p>
          <p className="text-center mt-2">
            <Link
              to="/mot-de-passe-oublie"
              className="text-sm text-slate-500 hover:text-amber-500 transition-colors"
            >
              Mot de passe oublié ?
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
