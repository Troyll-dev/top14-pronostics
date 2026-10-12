import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';

/**
 * « Ton adresse n'a pas été confirmée. »
 *
 * ---------------------------------------------------------------------------
 * POURQUOI CE BANDEAU EXISTE, ET POURQUOI IL PORTE UN CHAMP DE SAISIE
 * ---------------------------------------------------------------------------
 *
 * Une faute de frappe dans une adresse ne se signale nulle part : les courriels
 * partent, personne ne les reçoit, et rien ne revient. Le joueur cesse d'être
 * relancé le vendredi, finit par oublier de jouer, et on met ça sur le compte
 * du désintérêt.
 *
 * Le piège, quand on veut corriger ça, est d'envoyer un courriel demandant de
 * corriger l'adresse — à l'adresse fautive. Le seul endroit où une adresse
 * fausse peut être rattrapée est l'écran, puisque c'est le seul canal dont on
 * sait qu'il fonctionne. D'où ce bandeau, et surtout d'où le fait qu'il affiche
 * l'adresse en toutes lettres : la plupart des fautes se voient à l'œil
 * — « gmail.con », un prénom mal orthographié — et se corrigent en dix
 * secondes si on les montre.
 *
 * ---------------------------------------------------------------------------
 * CE QU'IL NE FAIT PAS
 * ---------------------------------------------------------------------------
 *
 * Il ne bloque rien. Le compte fonctionne, les pronostics se posent, le
 * classement se consulte. C'est un rappel, pas une barrière : entre huit amis,
 * fermer la porte à quelqu'un parce qu'il n'a pas cliqué sur un lien serait
 * disproportionné — et contre-productif, puisqu'on veut justement qu'il
 * continue à venir.
 *
 * Il se referme pour la session en cours, et revient au prochain chargement.
 * Un bandeau qu'on ne peut pas faire taire devient un meuble qu'on ne voit
 * plus ; un bandeau qui disparaît pour de bon ne sert à rien. Entre les deux,
 * il laisse respirer sans se laisser oublier.
 *
 * ---------------------------------------------------------------------------
 * APRÈS CONFIRMATION
 * ---------------------------------------------------------------------------
 *
 * Le bandeau ne disparaît pas tout seul quand on clique sur le lien depuis sa
 * boîte : l'application en cours ne sait rien de ce qui se passe dans un autre
 * onglet. Il s'en va au prochain chargement, quand `/auth/me` rend
 * `emailVerifie` à vrai. La page de confirmation, elle, recharge le site pour
 * cette raison précise.
 */
export default function BandeauVerification() {
  const { user } = useAuth();

  const [ouvert, setOuvert] = useState(true);
  const [edition, setEdition] = useState(false);
  const [adresse, setAdresse] = useState(user?.email || '');
  const [etat, setEtat] = useState('repos'); // repos | envoi | envoye
  const [erreur, setErreur] = useState('');

  if (!user || user.emailVerifie !== false || !ouvert) return null;

  const envoyer = async () => {
    setEtat('envoi');
    setErreur('');
    try {
      const corps = edition && adresse.trim() && adresse.trim() !== user.email
        ? { email: adresse.trim() }
        : {};
      const res = await api.post('/auth/verification/renvoyer', corps);
      setAdresse(res.data.email || adresse);
      setEdition(false);
      setEtat('envoye');
    } catch (err) {
      setErreur(
        err.response?.data?.error ||
        err.response?.data?.errors?.[0]?.msg ||
        "L'envoi a échoué"
      );
      setEtat('repos');
    }
  };

  return (
    <div
      role="status"
      className="relative z-20 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2.5"
    >
      <div className="max-w-5xl mx-auto flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px]">
        {etat === 'envoye' ? (
          <p className="flex-1 min-w-[220px]">
            <span className="font-semibold">C'est envoyé.</span>{' '}
            Ouvre le message à l'adresse <b className="break-all">{adresse}</b> et clique
            sur le lien. Pense à regarder dans les indésirables.
          </p>
        ) : (
          <>
            <p className="flex-1 min-w-[220px]">
              <span className="font-semibold">Ton adresse n'est pas confirmée.</span>{' '}
              {edition
                ? 'Corrige-la si elle est fautive, puis renvoie le lien.'
                : <>Les rappels partent vers <b className="break-all">{user.email}</b> — vérifie qu'elle est juste.</>}
            </p>

            {edition && (
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={adresse}
                onChange={(e) => setAdresse(e.target.value)}
                className="input flex-1 min-w-[200px] !py-1.5 !text-[13px]"
                placeholder="prenom@exemple.fr"
              />
            )}

            <div className="flex items-center gap-2 shrink-0">
              {!edition && (
                <button
                  onClick={() => setEdition(true)}
                  className="underline underline-offset-2 hover:opacity-80"
                >
                  Corriger
                </button>
              )}
              <button
                onClick={envoyer}
                disabled={etat === 'envoi'}
                className="btn-primary !py-1.5 !px-3 !text-[13px]"
              >
                {etat === 'envoi' ? 'Un instant…' : edition ? 'Enregistrer et envoyer' : 'Renvoyer le lien'}
              </button>
            </div>
          </>
        )}

        <button
          onClick={() => setOuvert(false)}
          title="Masquer jusqu'au prochain chargement"
          className="shrink-0 px-1 opacity-60 hover:opacity-100"
        >
          ✕
        </button>

        {erreur && <p role="alert" className="w-full text-red-400">{erreur}</p>}
      </div>
    </div>
  );
}
