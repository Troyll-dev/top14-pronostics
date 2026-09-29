import { useState, useEffect, useRef } from 'react';
import api from '../api/client';

/**
 * Inviter un ami.
 *
 * Deux presentations du meme mecanisme. Sur l'accueil, une carte courte : c'est
 * la qu'on pense a quelqu'un, pas dans les reglages de son profil. Dans le
 * profil, la meme chose plus la liste de ce qu'on a deja envoye, qui n'a rien a
 * faire sur l'accueil.
 *
 * Deux facons d'envoyer, cote a cote et sans hierarchie. Le lien a coller dans
 * une conversation ne demande rien et se voit avant de partir. Le courriel
 * demande une adresse, mais la prouve : l'invitation n'arrive que si l'adresse
 * existe, et c'est ce qui dispense de verifier l'adresse apres l'inscription.
 *
 * Le lien n'est rendu qu'une fois par le serveur, qui n'en garde que
 * l'empreinte. Il reste donc affiche tant qu'on ne ferme pas le panneau, et
 * disparait ensuite pour de bon — d'ou le bouton « copier » bien en evidence, et
 * le champ en lecture seule plutot qu'un simple texte : on peut le selectionner
 * a la main si la copie automatique echoue, ce qui arrive sur les navigateurs
 * qui la refusent hors d'un site securise.
 */
export default function InviterUnAmi({ compact = false }) {
  const [ouvert, setOuvert] = useState(false);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const [resultat, setResultat] = useState(null);   // { lien, envoye, soucis }
  const [copie, setCopie] = useState(false);
  const [liste, setListe] = useState([]);

  const champLien = useRef(null);

  const chargerListe = () => {
    if (compact) return;
    api.get('/invitations').then((r) => setListe(r.data)).catch(() => {});
  };

  useEffect(() => { chargerListe(); /* eslint-disable-next-line */ }, []);

  const creer = async (envoyer) => {
    setOccupe(true);
    setErreur('');
    setCopie(false);
    try {
      const { data } = await api.post('/invitations', {
        email: email.trim() || null,
        message: message.trim() || null,
        envoyer,
      });
      setResultat(data);
      chargerListe();
    } catch (err) {
      setErreur(err.response?.data?.error || 'Création impossible');
    } finally {
      setOccupe(false);
    }
  };

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(resultat.lien);
      setCopie(true);
      setTimeout(() => setCopie(false), 2500);
    } catch {
      // Refus du navigateur : on selectionne le texte, la personne fait
      // Ctrl+C. Mieux vaut une copie manuelle qu'un bouton qui ne dit rien.
      champLien.current?.select();
      setErreur('Copie refusée par le navigateur — le lien est sélectionné, fais Ctrl+C.');
    }
  };

  const fermer = () => {
    setOuvert(false);
    setResultat(null);
    setEmail('');
    setMessage('');
    setErreur('');
  };

  const annuler = async (id) => {
    try {
      await api.delete(`/invitations/${id}`);
      chargerListe();
    } catch (err) {
      setErreur(err.response?.data?.error || 'Annulation impossible');
    }
  };

  /* --- le panneau, commun aux deux presentations ------------------------- */

  const panneau = (
    <>
      {resultat ? (
        <div className="space-y-3">
          <p className="text-[13px] text-slate-400 leading-relaxed">
            {resultat.envoye
              ? `C'est parti : l'invitation est dans la boîte de ${resultat.email}.`
              : 'Le lien est prêt. Colle-le dans une conversation — il ne sert qu\'une fois.'}
          </p>

          <div className="flex gap-2">
            <input
              ref={champLien}
              readOnly
              value={resultat.lien}
              onFocus={(e) => e.target.select()}
              className="input flex-1 text-[12px]"
            />
            <button onClick={copier} className="btn-primary text-[13px] py-2 shrink-0">
              {copie ? 'Copié' : 'Copier'}
            </button>
          </div>

          {resultat.soucis && (
            <p className="text-[12.5px] text-amber-500 leading-relaxed">{resultat.soucis}</p>
          )}

          <p className="text-[11.5px] text-slate-500 leading-relaxed">
            Le serveur ne garde pas ce lien, seulement son empreinte : une fois ce panneau fermé,
            il n'est plus affichable. Si tu le perds, crée-en un autre.
          </p>

          <button onClick={fermer} className="text-[13px] text-slate-500 hover:text-amber-500 transition-colors">
            Fermer
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-[12.5px] text-slate-400 mb-1">
              Son adresse <span className="text-slate-600">— seulement si tu veux que l'appli lui écrive</span>
            </label>
            <input
              type="email"
              inputMode="email"
              className="input"
              placeholder="prenom@exemple.fr"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErreur(''); }}
            />
          </div>

          <div>
            <label className="block text-[12.5px] text-slate-400 mb-1">
              Un mot <span className="text-slate-600">— facultatif</span>
            </label>
            <input
              type="text"
              maxLength={280}
              className="input"
              placeholder="Viens, on a besoin d'un cinquième"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={() => creer(false)}
              disabled={occupe}
              className="btn-primary text-[13px] py-2"
            >
              {occupe ? '…' : 'Créer le lien'}
            </button>
            <button
              onClick={() => creer(true)}
              disabled={occupe || !email.trim()}
              title={!email.trim() ? 'Il faut une adresse pour envoyer' : undefined}
              className="font-display text-[13px] font-semibold px-3.5 py-2 rounded border
                         border-slate-700 text-slate-300 hover:border-amber-500 hover:text-amber-500
                         transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Envoyer par mail
            </button>
            <button onClick={fermer} className="text-[13px] text-slate-500 hover:text-amber-500 transition-colors">
              Annuler
            </button>
          </div>

          {erreur && <p className="text-[12.5px] text-red-400">{erreur}</p>}
        </div>
      )}
    </>
  );

  /* --- version courte, pour l'accueil ------------------------------------ */

  if (compact) {
    return (
      <div className="card mb-4">
        <h2 className="rule-label mb-3">Inviter un ami</h2>
        {ouvert ? panneau : (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <p className="text-[13px] text-slate-400 leading-relaxed min-w-0">
              On ne rejoint la bande que sur invitation. Un lien, et c'est réglé.
            </p>
            <button onClick={() => setOuvert(true)} className="btn-primary text-[13px] py-2 shrink-0">
              Inviter
            </button>
          </div>
        )}
      </div>
    );
  }

  /* --- version complete, pour le profil ---------------------------------- */

  const etatMot = { 'en-attente': 'en attente', utilisee: 'utilisée', expiree: 'expirée' };

  return (
    <>
      <h2 className="rule-label mt-8 mb-3">Inviter un ami</h2>
      <div className="card">
        {ouvert ? panneau : (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <p className="text-[13px] text-slate-400 leading-relaxed min-w-0">
              On ne rejoint la bande que sur invitation — un lien à coller, ou un courriel
              que l'appli envoie pour toi.
            </p>
            <button onClick={() => setOuvert(true)} className="btn-primary text-[13px] py-2 shrink-0">
              Inviter quelqu'un
            </button>
          </div>
        )}

        {liste.length > 0 && (
          <div className="mt-4 pt-3.5 border-t border-slate-800">
            <p className="text-[11px] uppercase tracking-wide text-slate-500 mb-2">Tes invitations</p>
            <div className="divide-y divide-slate-800">
              {liste.map((i) => (
                <div key={i.id} className="flex items-center gap-3 py-2 text-[12.5px]">
                  <span className="min-w-0 truncate text-slate-400">
                    {i.email || 'lien sans adresse'}
                  </span>
                  <span className={`shrink-0 ${
                    i.etat === 'utilisee' ? 'text-green-400'
                    : i.etat === 'expiree' ? 'text-slate-600'
                    : 'text-amber-500'
                  }`}>
                    {i.etat === 'utilisee' && i.parQui ? `rejointe par ${i.parQui}` : etatMot[i.etat]}
                  </span>
                  {i.etat === 'en-attente' && (
                    <button
                      onClick={() => annuler(i.id)}
                      className="ml-auto shrink-0 text-slate-500 hover:text-red-400 transition-colors"
                    >
                      annuler
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
