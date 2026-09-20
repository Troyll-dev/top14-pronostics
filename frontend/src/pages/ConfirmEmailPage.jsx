import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api/client';

/**
 * Page d'arrivee du lien de confirmation d'adresse.
 *
 * Accessible sans etre connecte : on clique depuis sa boite mail, souvent sur
 * le telephone alors que la session est restee sur l'ordinateur.
 */
export default function ConfirmEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token');

  const [state, setState] = useState('encours');   // encours | ok | erreur
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;      // React monte deux fois en developpement
    done.current = true;

    if (!token) {
      setState('erreur');
      setMessage('Lien incomplet : il manque le jeton.');
      return;
    }

    api.post('/users/confirm-email', { token })
      .then((res) => { setEmail(res.data.email); setState('ok'); })
      .catch((err) => {
        setState('erreur');
        setMessage(err.response?.data?.error || 'Confirmation impossible.');
      });
  }, [token]);

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="card text-center">
        <p className="text-[38px] leading-none mb-3">
          {state === 'encours' ? '⏳' : state === 'ok' ? '✅' : '⚠️'}
        </p>

        <h1 className="font-display text-[22px] font-extrabold leading-tight mb-2">
          {state === 'encours' ? 'Vérification…'
            : state === 'ok' ? 'Adresse confirmée'
            : 'Lien inutilisable'}
        </h1>

        <p className="text-[13.5px] text-slate-400 leading-relaxed">
          {state === 'encours' ? 'Un instant, on vérifie ton lien.'
            : state === 'ok'
              ? <>Tu te connectes désormais avec <b className="text-white">{email}</b>.</>
              : message}
        </p>

        {state === 'erreur' && (
          <p className="text-[12px] text-slate-500 mt-3 leading-relaxed">
            Les liens ne valent qu’une heure et ne servent qu’une fois. Relance la demande
            depuis ton profil pour en recevoir un nouveau.
          </p>
        )}

        {state !== 'encours' && (
          <Link to="/" className="btn-primary text-[13.5px] inline-block mt-5">
            Retour à l’appli
          </Link>
        )}
      </div>
    </div>
  );
}
