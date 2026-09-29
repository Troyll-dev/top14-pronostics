import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';
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
  const [params] = useSearchParams();
  const jeton = params.get('invitation');

  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  /**
   * L'invitation, lue avant d'afficher quoi que ce soit.
   *
   * `null` tant qu'on ne sait pas — et on ne montre alors ni formulaire ni
   * refus. Afficher un formulaire pour le remplacer une seconde plus tard par
   * « il faut une invitation » est desagreable ; annoncer un refus avant d'avoir
   * verifie serait pire.
   */
  const [invitation, setInvitation] = useState(null);
  const [mode, setMode] = useState(null);   // { surInvitation }

  useEffect(() => {
    api.get('/invitations/mode')
      .then((r) => setMode(r.data))
      // Si la question ne trouve pas de reponse — serveur ancien, panne reseau —
      // on suppose l'inscription ouverte et on laisse le serveur trancher a
      // l'envoi. Bloquer sur une incertitude fermerait la porte a tort.
      .catch(() => setMode({ surInvitation: false }));

    if (!jeton) { setInvitation({ valide: false, raison: 'absente' }); return; }

    api.get('/invitations/verifier', { params: { jeton } })
      .then((r) => {
        setInvitation(r.data);
        // Quand l'invitation portait une adresse, on la pre-remplit : c'est
        // celle qui sera exigee, la retaper ne serait qu'une occasion de se
        // tromper.
        if (r.data?.valide && r.data.email) {
          setForm((f) => ({ ...f, email: r.data.email }));
        }
      })
      .catch((err) => setInvitation(err.response?.data || { valide: false, raison: 'inconnue' }));
  }, [jeton]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(form.username, form.email, form.password, jeton);
      navigate('/');
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.errors?.[0]?.msg || 'Erreur inscription';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const enAttente = mode === null || invitation === null;
  const bloque = mode?.surInvitation && !invitation?.valide;

  if (enAttente) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <p className="text-slate-500 animate-pulse">Un instant…</p>
      </div>
    );
  }

  /**
   * Le refus, quand l'inscription est reservee aux invites.
   *
   * On dit ce qui manque et comment l'obtenir, plutot que de se contenter d'un
   * non. Le message distingue les trois cas — pas de lien, lien perime, lien
   * deja servi — parce que la conduite a tenir n'est pas la meme : dans le
   * premier il faut demander, dans les deux autres il faut redemander.
   */
  if (bloque) {
    const raison = invitation?.raison;
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <Bandeau />
          <div className="text-center mb-5">
            <h1 className="font-display text-[30px] font-extrabold leading-none">Sur invitation</h1>
          </div>
          <div className="card text-center">
            <p className="text-[14px] text-slate-400 leading-relaxed">
              {raison === 'expiree'
                ? 'Ce lien d\'invitation a expiré. Demande-en un nouveau à celui qui te l\'a envoyé — ça lui prend dix secondes.'
                : raison === 'deja-utilisee'
                ? 'Ce lien a déjà servi à créer un compte. Si ce n\'était pas toi, demande un nouveau lien.'
                : 'On ne rejoint la bande que sur invitation. Demande son lien à l\'un des joueurs : il le trouve dans son profil.'}
            </p>
            <p className="text-center text-slate-400 text-sm mt-5">
              Déjà un compte ?{' '}
              <Link to="/login" className="text-amber-400 hover:underline">Se connecter</Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <Bandeau />

        <div className="text-center mb-5">
          <h1 className="font-display text-[30px] font-extrabold leading-none">
            {invitation?.valide ? `${invitation.parrain} t'invite` : 'Rejoins la bande'}
          </h1>
          <p className="text-[13px] text-slate-400 mt-1.5">
            Une adresse, un pseudo, et tu pronostiques dès la prochaine journée.
          </p>
        </div>

        <div className="card">
          {/* Le mot laisse par celui qui invite. Il n'apparait que s'il existe :
              un encadre vide avec des guillemets aurait l'air d'un defaut. */}
          {invitation?.valide && invitation.message && (
            <p className="text-[13px] italic text-slate-400 leading-relaxed mb-4 pb-4 border-b border-slate-800">
              « {invitation.message} »
              <span className="not-italic text-slate-500"> — {invitation.parrain}</span>
            </p>
          )}
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
                readOnly={Boolean(invitation?.valide && invitation.email)}
                required
              />
              <p className="text-[11.5px] text-slate-500 mt-1.5">
                {invitation?.valide && invitation.email
                  ? 'C\'est l\'adresse à laquelle l\'invitation a été envoyée : elle ne peut pas être changée ici.'
                  : 'Les rappels et le bilan du lundi partiront là — et c\'est aussi la seule façon de récupérer ton mot de passe. Vérifie-la bien.'}
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
