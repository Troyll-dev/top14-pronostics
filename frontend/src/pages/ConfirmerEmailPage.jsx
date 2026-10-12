import { useEffect, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../api/client';

/**
 * La page au bout du lien de confirmation.
 *
 * ---------------------------------------------------------------------------
 * ELLE EST PUBLIQUE
 * ---------------------------------------------------------------------------
 *
 * Pas de `PrivateRoute` autour d'elle, et c'est voulu : on s'inscrit depuis
 * l'ordinateur et on relève sa boîte sur le téléphone, donc le lien s'ouvre le
 * plus souvent là où aucune session n'existe. Demander de se connecter avant de
 * pouvoir confirmer ajouterait l'obstacle précisément là où l'on cherche à en
 * retirer un. Le jeton est la preuve, et il ne donne accès à rien d'autre.
 *
 * ---------------------------------------------------------------------------
 * LE RECHARGEMENT COMPLET À LA FIN
 * ---------------------------------------------------------------------------
 *
 * `window.location.href` plutôt qu'un `navigate` : si l'on est connecté dans cet
 * onglet, le contexte d'authentification porte encore l'ancien profil, avec
 * `emailVerifie` à faux — le bandeau resterait affiché après une confirmation
 * réussie, ce qui ressemblerait à un bug. Un vrai chargement relit `/auth/me` et
 * tout se remet d'aplomb. C'est une page qu'on visite une fois dans sa vie :
 * elle peut bien coûter un rechargement.
 *
 * ---------------------------------------------------------------------------
 * LE GARDE-FOU
 * ---------------------------------------------------------------------------
 *
 * `lance` empêche le double envoi que React provoque en développement, où les
 * effets sont joués deux fois exprès. Sans lui, le second appel trouverait un
 * jeton déjà consommé et afficherait « ce lien a déjà servi » juste après
 * l'avoir fait fonctionner.
 */
export default function ConfirmerEmailPage() {
  const [params] = useSearchParams();
  const jeton = params.get('jeton');

  const [etat, setEtat] = useState('attente'); // attente | ok | deja | echec
  const [raison, setRaison] = useState('');
  const lance = useRef(false);

  useEffect(() => {
    if (lance.current) return;
    lance.current = true;

    if (!jeton) {
      setEtat('echec');
      setRaison('inconnu');
      return;
    }

    api.post('/auth/confirmer', { jeton })
      .then((res) => {
        if (res.data.ok) setEtat(res.data.deja ? 'deja' : 'ok');
        else {
          setEtat('echec');
          setRaison(res.data.raison || 'inconnu');
        }
      })
      .catch(() => {
        setEtat('echec');
        setRaison('serveur');
      });
  }, [jeton]);

  const phrases = {
    expire: "Ce lien a passé sa date. Connecte-toi et demande-en un nouveau depuis le bandeau, en haut de l'écran.",
    remplace: "Ce lien a été remplacé par un plus récent — regarde le dernier message reçu.",
    inconnu: "Ce lien ne correspond à rien. Il a peut-être été coupé en deux par ta messagerie : essaie de le copier en entier dans la barre d'adresse.",
    serveur: "Le serveur n'a pas répondu. Réessaie dans un moment.",
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md text-center">
        <div className="card">
          {etat === 'attente' && (
            <p className="text-slate-400 animate-pulse py-6">Vérification en cours…</p>
          )}

          {(etat === 'ok' || etat === 'deja') && (
            <>
              <h1 className="font-display text-[26px] font-extrabold leading-none mb-2">
                {etat === 'ok' ? 'Adresse confirmée' : 'C\'était déjà fait'}
              </h1>
              <p className="text-[13.5px] text-slate-400 mb-5">
                {etat === 'ok'
                  ? 'Les rappels du vendredi et le bilan du lundi arriveront bien jusqu\'à toi.'
                  : 'Cette adresse était déjà confirmée — rien de plus à faire.'}
              </p>
              <button
                onClick={() => { window.location.href = '/'; }}
                className="btn-primary w-full"
              >
                Aller au site
              </button>
            </>
          )}

          {etat === 'echec' && (
            <>
              <h1 className="font-display text-[26px] font-extrabold leading-none mb-2">
                Lien inutilisable
              </h1>
              <p className="text-[13.5px] text-slate-400 mb-5">
                {phrases[raison] || phrases.inconnu}
              </p>
              <Link to="/" className="btn-primary w-full inline-block">Aller au site</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
