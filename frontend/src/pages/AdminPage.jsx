import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';

const dateHeure = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  timeZone: 'Europe/Paris',
});

const jourSeul = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris',
});

/**
 * « Il y a deux heures » plutôt que « mardi 12 nov. à 09:07 ».
 *
 * Pour une date de surveillance, l'âge est l'information utile et la date
 * exacte ne l'est pas : on veut savoir si c'est récent, pas quel jour c'était.
 * La date complète reste dans l'infobulle, pour le jour où on la cherche.
 */
function depuis(iso) {
  if (!iso) return 'jamais';
  const min = Math.round((Date.now() - new Date(iso)) / 60000);
  if (min < 2) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  return `il y a ${j} jour${j > 1 ? 's' : ''}`;
}

/** « il y a 12 min », « il y a 3 h », « il y a 2 jours ». */
function duree(min) {
  if (min == null) return '';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} jours`;
}

/**
 * La pastille d'état.
 *
 * Cinq situations, et deux d'entre elles méritent qu'on s'y arrête.
 *
 * « pas encore passée », en gris : le serveur vient de redémarrer et la tâche
 * n'a pas eu son tour. Après un déploiement à 11 h, les horaires de 6 h 20 sont
 * dans ce cas jusqu'au lendemain matin. Ce n'est pas une panne mais une absence
 * de réponse, et les peindre en rouge toutes les deux ferait d'un écran de
 * surveillance un écran qu'on apprend à ignorer.
 *
 * « actif » sans seuil, en vert pâle : les résultats se taisent légitimement
 * hors saison, donc aucun retard ne leur est reproché. Le dire évite de laisser
 * croire à un contrôle qui n'a pas lieu.
 */
function Pastille({ etat, suivie }) {
  const styles = {
    ok: 'bg-green-500/20 text-green-400 border-green-500/40',
    attente: 'bg-slate-500/20 text-slate-400 border-slate-500/40',
    retard: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    echec: 'bg-red-500/20 text-red-400 border-red-500/40',
    jamais: 'bg-red-500/20 text-red-400 border-red-500/40',
  };
  const mots = {
    ok: suivie ? 'OK' : 'actif',
    attente: 'pas encore passée',
    retard: 'en retard',
    echec: 'en échec',
    jamais: 'jamais vue',
  };
  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${styles[etat]}`}>
      {mots[etat]}
    </span>
  );
}

/**
 * L'état du site : les tâches automatiques et les adresses non confirmées.
 *
 * ---------------------------------------------------------------------------
 * POURQUOI CETTE CARTE EST LA PREMIÈRE DE LA PAGE
 * ---------------------------------------------------------------------------
 *
 * Les deux formulaires du dessous — créer un match, saisir un résultat — ne
 * servent presque jamais : les scores arrivent tout seuls, et une rencontre
 * créée à la main est l'exception. Ce qu'on vient vraiment chercher ici, c'est
 * l'état des choses, en général après avoir reçu l'alerte du matin.
 *
 * ---------------------------------------------------------------------------
 * ELLE NE REMPLACE PAS L'ALERTE
 * ---------------------------------------------------------------------------
 *
 * Et c'est important : une page ne se consulte que lorsqu'on soupçonne déjà un
 * problème. C'est précisément le défaut qui a laissé le bug des statistiques
 * vivre cinq semaines dans les journaux. L'alerte quotidienne vient te
 * chercher ; cette page dit le détail une fois que tu es là.
 */
function EtatDuSite() {
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState('');
  const [simulation, setSimulation] = useState(null);

  useEffect(() => {
    api.get('/admin/sante')
      .then((r) => setData(r.data))
      .catch((e) => setErreur(e.response?.data?.error || 'Lecture impossible'));
  }, []);

  const simuler = async () => {
    setSimulation({ enCours: true });
    try {
      const r = await api.post('/admin/sante/simuler');
      setSimulation(r.data);
    } catch (e) {
      setSimulation({ erreur: e.response?.data?.error || 'Simulation impossible' });
    }
  };

  if (erreur) {
    return (
      <div className="card">
        <h2 className="font-semibold mb-2">État du site</h2>
        <p className="text-red-400 text-sm">{erreur}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card">
        <p className="text-slate-500 text-sm animate-pulse">Lecture de l'état…</p>
      </div>
    );
  }

  const ennuis = data.anomalies.length;

  return (
    <>
      <div className="card">
        <div className="flex items-baseline justify-between gap-3 mb-1">
          <h2 className="font-semibold">Tâches automatiques</h2>
          <span className={`text-[12px] ${ennuis ? 'text-red-400 font-semibold' : 'text-slate-500'}`}>
            {ennuis
              ? `${ennuis} anomalie${ennuis > 1 ? 's' : ''}`
              : 'rien à signaler'}
          </span>
        </div>
        <p className="text-[11.5px] text-slate-500 mb-4">
          Une alerte part chaque matin à 9 h 07, et seulement s'il y a quelque chose à dire.
          Une tâche qui n'a pas encore eu son tour depuis le dernier déploiement n'est pas
          comptée comme une anomalie.
        </p>

        <div className="divide-y divide-slate-800">
          {data.taches.map((t) => (
            <div key={t.job} className="py-2.5 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[13.5px]">{t.libelle}</span>
                  <Pastille etat={t.etat} suivie={t.suivie} />
                </div>
                <p className="text-[12px] text-slate-500 mt-0.5">
                  Dernière réussite{' '}
                  <span title={t.lastSuccessAt ? dateHeure.format(new Date(t.lastSuccessAt)) : ''}>
                    {depuis(t.lastSuccessAt)}
                  </span>
                  {t.suivie && t.seuil !== null && (
                    <span className="text-slate-600"> · seuil {t.seuil} j</span>
                  )}
                  {!t.suivie && (
                    <span className="text-slate-600"> · sans seuil, normal hors saison</span>
                  )}
                  {t.etat === 'attente' && t.suivie && (
                    <span className="text-slate-600">
                      {' '}· serveur redémarré {duree(t.minutesDeMarche)}
                    </span>
                  )}
                </p>
                {t.lastError && (
                  <p className="text-[12px] text-red-400 mt-1 break-words">
                    {t.lastError}
                    <span className="text-slate-600">
                      {' '}({depuis(t.lastErrorAt)})
                    </span>
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button onClick={simuler} className="btn-primary !text-[13px] !py-1.5 !px-3">
            Voir ce que l'alerte dirait
          </button>
          {simulation?.enCours && <span className="text-[12px] text-slate-500">Un instant…</span>}
          {simulation?.erreur && <span className="text-[12px] text-red-400">{simulation.erreur}</span>}
          {simulation && !simulation.enCours && !simulation.erreur && (
            <p className="w-full text-[12.5px] whitespace-pre-wrap text-slate-400 border-l-2 border-slate-700 pl-3">
              {simulation.anomalies?.length
                ? simulation.texte
                : "Rien ne partirait : toutes les tâches sont à jour."}
            </p>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-1">Adresses non confirmées</h2>
        <p className="text-[11.5px] text-slate-500 mb-4">
          Une adresse jamais confirmée peut être fautive — auquel cas ce joueur ne reçoit
          plus aucun courriel, et ne le sait pas.
        </p>

        {data.nonConfirmes.length === 0 ? (
          <p className="text-[13px] text-slate-500">
            Tout le monde a confirmé la sienne.
          </p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {data.nonConfirmes.map((u) => (
              <li key={u.id} className="py-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-[13.5px]">{u.username}</span>
                  {u.enPause && (
                    <span className="rounded-full border border-slate-600 px-2 py-0.5 text-[11px] text-slate-400">
                      en pause
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-slate-500 break-all">
                  {u.email} · inscrit le {jourSeul.format(new Date(u.createdAt))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/**
 * ---------------------------------------------------------------------------
 * LES JOUEURS
 * ---------------------------------------------------------------------------
 *
 * Trois gestes qui se ressemblent de loin et n'ont rien a voir de pres :
 *
 *   la pause sort quelqu'un du classement et des courriels, sans rien effacer,
 *   et se defait d'un clic ;
 *   la suppression efface le compte et tout ce qui s'y rattache ;
 *   le bannissement ferme l'inscription a une adresse, sans toucher aux comptes.
 *
 * L'ecran les tient volontairement a des distances differentes de la main. La
 * pause est un bouton ordinaire. La suppression demande de retaper le pseudo,
 * apres avoir lu ce qu'elle emporte. Les bannissements vivent dans leur propre
 * bloc, plus bas, parce qu'ils ne parlent pas des memes objets — ce sont des
 * adresses, pas des gens.
 *
 * Le chiffre avant la confirmation est le coeur du dispositif. Supprimer un
 * intrus inscrit la veille et supprimer un copain de cinq mois sont le meme
 * clic ; seule la phrase « 142 pronostics et 31 messages » distingue les deux,
 * et elle le fait sans qu'on ait a reflechir.
 */
function LigneJoueur({ j, onPause, onSupprimer, occupe }) {
  return (
    <div className="py-3 border-b border-slate-800 last:border-0">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="font-display text-[14px] font-bold flex items-center gap-2 flex-wrap">
            {j.username}
            {j.moi && <span className="chip-accent text-[10px] px-1.5 py-0.5 rounded-full">toi</span>}
            {j.admin && !j.moi && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400">admin</span>
            )}
            {j.enPause && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400">en pause</span>
            )}
            {!j.emailVerifie && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500"
                title="Le lien de confirmation n'a jamais été suivi"
              >
                adresse non confirmée
              </span>
            )}
          </p>
          <p className="text-[11.5px] text-slate-500 break-all">{j.email}</p>
          <p className="text-[11.5px] text-slate-500 mt-0.5">
            inscrit {depuis(j.createdAt)} · {j.pronostics} pronostic{j.pronostics > 1 ? 's' : ''} ·{' '}
            {j.messages} message{j.messages > 1 ? 's' : ''}
            {j.dernierMessageAt && <> · dernier message {depuis(j.dernierMessageAt)}</>}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => onPause(j)}
            disabled={occupe || (j.admin && !j.moi)}
            className="text-[12.5px] text-slate-400 hover:text-amber-500 transition-colors disabled:opacity-40 disabled:hover:text-slate-400"
            title={j.admin && !j.moi ? 'On ne met pas un autre administrateur en pause' : undefined}
          >
            {j.enPause ? 'Réactiver' : 'Mettre en pause'}
          </button>
          <button
            onClick={() => onSupprimer(j)}
            disabled={occupe || j.moi || j.admin}
            className="text-[12.5px] text-slate-500 hover:text-red-400 transition-colors disabled:opacity-40 disabled:hover:text-slate-500"
            title={j.moi ? 'Pas ton propre compte' : j.admin ? 'Retire son adresse d’ADMIN_EMAILS d’abord' : undefined}
          >
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * La confirmation d'une suppression.
 *
 * Elle affiche ce qui va disparaitre, exige le pseudo retape a l'identique, et
 * propose de bannir l'adresse dans le meme geste — case cochee par defaut,
 * parce que c'est presque toujours la meme intention : on ne supprime pas un
 * intrus pour le voir revenir le lendemain.
 *
 * Retaper le pseudo n'est pas une formalite decorative. C'est la seule garantie
 * contre le clic sur la mauvaise ligne, qui est l'erreur reelle ici — bien plus
 * probable que de vouloir supprimer sans le vouloir.
 */
function ConfirmationSuppression({ cible, onAnnuler, onConfirmer, occupe }) {
  const [saisie, setSaisie] = useState('');
  const [bannir, setBannir] = useState(true);
  const [motif, setMotif] = useState('');

  const pret = saisie.trim() === cible.username;

  return (
    <div
      className="mt-3 rounded-lg p-3.5"
      style={{ backgroundColor: 'rgba(239,68,68,.07)', border: '1px solid rgba(239,68,68,.28)' }}
    >
      <p className="text-[13.5px] font-display font-semibold mb-1">
        Supprimer définitivement {cible.username} ?
      </p>

      {cible.consequences ? (
        <p className="text-[12.5px] text-slate-400 leading-relaxed mb-3">
          Ce compte a <b>{cible.consequences.pronostics} pronostic
          {cible.consequences.pronostics > 1 ? 's' : ''}</b> et{' '}
          <b>{cible.consequences.messages} message
          {cible.consequences.messages > 1 ? 's' : ''}</b>. Tout disparaît, y compris
          sa photo et ses rappels.
          {cible.consequences.journees.length > 0 && (
            <>
              {' '}Les classements des journées {cible.consequences.journees.join(', ')} seront
              recalculés sans lui.
            </>
          )}
        </p>
      ) : (
        <p className="text-[12.5px] text-slate-500 mb-3">Lecture de ce que ça emporte…</p>
      )}

      <label className="flex items-start gap-2.5 text-[12.5px] text-slate-400 mb-2 cursor-pointer">
        <input
          type="checkbox"
          checked={bannir}
          onChange={(e) => setBannir(e.target.checked)}
          className="mt-0.5 w-4 h-4 accent-amber-500 cursor-pointer"
        />
        <span>
          Bannir aussi <b className="break-all">{cible.email}</b> — l’adresse ne pourra plus
          créer de compte.
        </span>
      </label>

      {bannir && (
        <input
          value={motif}
          onChange={(e) => setMotif(e.target.value.slice(0, 200))}
          placeholder="Motif (facultatif, pour t’en souvenir)"
          className="w-full bg-slate-950 border-[1.5px] border-slate-800 rounded-md px-3 py-1.5 mb-2
                     text-[13px] text-white placeholder:text-slate-600
                     focus:outline-none focus:border-amber-500 transition-colors"
        />
      )}

      <p className="text-[12px] text-slate-500 mb-1.5">
        Retape <b>{cible.username}</b> pour confirmer.
      </p>
      <input
        value={saisie}
        onChange={(e) => setSaisie(e.target.value)}
        placeholder={cible.username}
        className="w-full bg-slate-950 border-[1.5px] border-slate-800 rounded-md px-3 py-1.5 mb-3
                   text-[13px] text-white placeholder:text-slate-600
                   focus:outline-none focus:border-red-400 transition-colors"
      />

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => onConfirmer({ bannir, motif })}
          disabled={!pret || occupe}
          className="font-display text-[13px] font-semibold px-3.5 py-2 rounded border
                     border-red-400/40 text-red-400 hover:bg-red-400/10 transition-colors
                     disabled:opacity-40 disabled:hover:bg-transparent"
        >
          {occupe ? '…' : 'Supprimer définitivement'}
        </button>
        <button
          onClick={onAnnuler}
          className="text-[13px] text-slate-500 hover:text-amber-500 transition-colors"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}

function LesJoueurs() {
  const [joueurs, setJoueurs] = useState(null);
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [cible, setCible] = useState(null);     // la suppression en cours de confirmation

  const charger = () =>
    api.get('/admin/joueurs')
      .then((r) => { setJoueurs(r.data); setErreur(''); })
      .catch((e) => setErreur(e.response?.data?.error || 'Lecture impossible'));

  useEffect(() => { charger(); }, []);

  const basculerPause = async (j) => {
    setOccupe(true);
    try {
      await api.patch(`/admin/joueurs/${j.id}/pause`, { enPause: !j.enPause });
      await charger();
    } catch (e) {
      setErreur(e.response?.data?.error || 'Changement impossible');
    } finally {
      setOccupe(false);
    }
  };

  /**
   * Ouvrir la confirmation, puis aller chercher les chiffres.
   *
   * Dans cet ordre, et pas l'inverse : le panneau s'ouvre tout de suite avec
   * « Lecture de ce que ça emporte… », et les chiffres arrivent. Attendre la
   * reponse pour ouvrir donnerait un bouton qui ne repond pas pendant une
   * seconde, et on recliquerait.
   */
  const demanderSuppression = async (j) => {
    setCible({ ...j, consequences: null });
    try {
      const r = await api.get(`/admin/joueurs/${j.id}/consequences`);
      setCible((c) => (c && c.id === j.id ? { ...c, consequences: r.data } : c));
    } catch {
      setCible((c) => (c && c.id === j.id ? { ...c, consequences: { pronostics: '?', messages: '?', journees: [] } } : c));
    }
  };

  const supprimer = async ({ bannir, motif }) => {
    setOccupe(true);
    try {
      await api.delete(`/admin/joueurs/${cible.id}`, { data: { bannir, motif } });
      setCible(null);
      await charger();
      window.dispatchEvent(new CustomEvent('bannissements-changes'));
    } catch (e) {
      setErreur(e.response?.data?.error || 'Suppression impossible');
    } finally {
      setOccupe(false);
    }
  };

  return (
    <div className="card">
      <h2 className="rule-label mb-1">Les joueurs</h2>
      <p className="text-[11.5px] text-slate-500 mb-2">
        La pause retire du classement et des courriels sans rien effacer, et se défait.
        La suppression, elle, efface tout.
      </p>

      {erreur && <p className="text-[12.5px] text-red-400 mb-2">{erreur}</p>}

      {!joueurs ? (
        <p className="text-[13px] text-slate-500 animate-pulse py-3">Lecture…</p>
      ) : (
        <>
          {joueurs.map((j) => (
            <div key={j.id}>
              <LigneJoueur
                j={j}
                occupe={occupe}
                onPause={basculerPause}
                onSupprimer={demanderSuppression}
              />
              {cible?.id === j.id && (
                <ConfirmationSuppression
                  cible={cible}
                  occupe={occupe}
                  onAnnuler={() => setCible(null)}
                  onConfirmer={supprimer}
                />
              )}
            </div>
          ))}
          <p className="text-[11px] italic text-slate-600 mt-3">
            {joueurs.length} compte{joueurs.length > 1 ? 's' : ''} ·{' '}
            {joueurs.filter((j) => j.enPause).length} en pause
          </p>
        </>
      )}
    </div>
  );
}

/**
 * ---------------------------------------------------------------------------
 * LES ADRESSES BANNIES
 * ---------------------------------------------------------------------------
 *
 * Un bloc a part, parce qu'il ne parle pas des memes objets : ce sont des
 * adresses, pas des gens. Une adresse bannie n'a pas forcement eu de compte, et
 * un compte supprime n'implique pas que son adresse soit fermee.
 *
 * La liste se recharge aussi quand une suppression vient d'en ajouter une —
 * d'ou l'evenement ecoute plus bas. Sans lui, on supprimerait un intrus en
 * cochant « bannir », et le bloc d'en dessous continuerait d'afficher une liste
 * vide : on douterait d'avoir bien coche.
 */
function AdressesBannies() {
  const [liste, setListe] = useState(null);
  const [email, setEmail] = useState('');
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState('');
  const [avis, setAvis] = useState('');
  const [occupe, setOccupe] = useState(false);

  const charger = () =>
    api.get('/admin/joueurs/bannissements')
      .then((r) => setListe(r.data))
      .catch((e) => setErreur(e.response?.data?.error || 'Lecture impossible'));

  useEffect(() => {
    charger();
    const relire = () => charger();
    window.addEventListener('bannissements-changes', relire);
    return () => window.removeEventListener('bannissements-changes', relire);
  }, []);

  const bannir = async (e) => {
    e.preventDefault();
    setOccupe(true);
    setErreur('');
    setAvis('');
    try {
      const r = await api.post('/admin/joueurs/bannissements', { email, motif });
      setEmail('');
      setMotif('');
      await charger();
      // Le piege a eviter : croire qu'on vient d'expulser quelqu'un alors qu'on
      // a seulement ferme la porte d'entree. Si un compte porte cette adresse,
      // on le dit tout de suite.
      if (r.data.comptesExistants?.length) {
        setAvis(
          `Attention : ${r.data.comptesExistants.map((c) => c.username).join(', ')} ` +
          'utilise cette adresse. Son compte existe toujours — le bannissement ne ferme que l’inscription.'
        );
      }
    } catch (e2) {
      setErreur(e2.response?.data?.error || 'Bannissement impossible');
    } finally {
      setOccupe(false);
    }
  };

  const lever = async (id) => {
    setOccupe(true);
    try {
      await api.delete(`/admin/joueurs/bannissements/${id}`);
      await charger();
    } catch (e) {
      setErreur(e.response?.data?.error || 'Impossible de lever');
    } finally {
      setOccupe(false);
    }
  };

  return (
    <div className="card">
      <h2 className="rule-label mb-1">Adresses bannies</h2>
      <p className="text-[11.5px] text-slate-500 mb-3">
        Elles ne peuvent plus créer de compte. Les comptes existants ne sont pas touchés —
        pour ceux-là, la pause ou la suppression.
      </p>

      <form onSubmit={bannir} className="flex gap-2 flex-wrap mb-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="adresse@exemple.fr"
          className="flex-1 min-w-[180px] bg-slate-950 border-[1.5px] border-slate-800 rounded-md px-3 py-1.5
                     text-[13px] text-white placeholder:text-slate-600
                     focus:outline-none focus:border-amber-500 transition-colors"
        />
        <input
          value={motif}
          onChange={(e) => setMotif(e.target.value.slice(0, 200))}
          placeholder="Motif (facultatif)"
          className="flex-1 min-w-[140px] bg-slate-950 border-[1.5px] border-slate-800 rounded-md px-3 py-1.5
                     text-[13px] text-white placeholder:text-slate-600
                     focus:outline-none focus:border-amber-500 transition-colors"
        />
        <button type="submit" disabled={occupe} className="btn-primary text-[13px] py-1.5 shrink-0">
          Bannir
        </button>
      </form>

      {erreur && <p className="text-[12.5px] text-red-400 mb-2">{erreur}</p>}
      {avis && <p className="text-[12.5px] text-amber-500 mb-2 leading-relaxed">{avis}</p>}

      {!liste ? (
        <p className="text-[13px] text-slate-500 animate-pulse">Lecture…</p>
      ) : liste.length === 0 ? (
        <p className="text-[12.5px] text-slate-500">Aucune adresse bannie.</p>
      ) : (
        liste.map((b) => (
          <div key={b.id} className="flex items-start justify-between gap-3 py-2 border-b border-slate-800 last:border-0">
            <div className="min-w-0">
              <p className="text-[13px] font-display font-semibold break-all">{b.email}</p>
              <p className="text-[11.5px] text-slate-500">
                {depuis(b.createdAt)}
                {b.motif && <> · {b.motif}</>}
              </p>
            </div>
            <button
              onClick={() => lever(b.id)}
              disabled={occupe}
              className="text-[12.5px] text-slate-500 hover:text-amber-500 transition-colors shrink-0"
            >
              Lever
            </button>
          </div>
        ))
      )}
    </div>
  );
}

/**
 * ---------------------------------------------------------------------------
 * LA MODERATION DU CHAT
 * ---------------------------------------------------------------------------
 *
 * Le petit marteau, a cote des deux gros. Un message deplace ne justifie pas de
 * s'en prendre a son auteur ; sans ce bloc, les seuls outils disponibles contre
 * une parole de trop etaient la pause et la suppression de compte — punir
 * quelqu'un pour une phrase, faute de pouvoir retirer la phrase.
 *
 * Les trente derniers messages suffisent : on modere ce qu'on vient de lire, pas
 * les archives. La suppression est immediate et sans confirmation — un message
 * efface par erreur se reecrit, ce qui n'est pas le cas d'un compte.
 */
function ModerationChat() {
  const [messages, setMessages] = useState(null);
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);

  const charger = () =>
    api.get('/messages?limit=30')
      .then((r) => setMessages(r.data.slice().reverse()))
      .catch((e) => setErreur(e.response?.data?.error || 'Lecture impossible'));

  useEffect(() => { charger(); }, []);

  const effacer = async (id) => {
    setOccupe(true);
    try {
      await api.delete(`/messages/${id}`);
      await charger();
    } catch (e) {
      setErreur(e.response?.data?.error || 'Suppression impossible');
    } finally {
      setOccupe(false);
    }
  };

  return (
    <div className="card">
      <h2 className="rule-label mb-1">Modération du Comptoir</h2>
      <p className="text-[11.5px] text-slate-500 mb-3">
        Les trente derniers messages. Retirer un message ne touche pas à son auteur,
        et la disparition arrive chez les autres dans les six secondes.
      </p>

      {erreur && <p className="text-[12.5px] text-red-400 mb-2">{erreur}</p>}

      {!messages ? (
        <p className="text-[13px] text-slate-500 animate-pulse">Lecture…</p>
      ) : messages.length === 0 ? (
        <p className="text-[12.5px] text-slate-500">Le salon est vide.</p>
      ) : (
        <div className="max-h-[22rem] overflow-y-auto pr-1">
          {messages.map((m) => (
            <div key={m.id} className="flex items-start justify-between gap-3 py-2 border-b border-slate-800 last:border-0">
              <div className="min-w-0">
                <p className="text-[11.5px] text-slate-500">
                  {m.user?.username} · {depuis(m.createdAt)}
                </p>
                <p className="text-[13px] break-words">{m.body}</p>
              </div>
              <button
                onClick={() => effacer(m.id)}
                disabled={occupe}
                className="text-[12.5px] text-slate-500 hover:text-red-400 transition-colors shrink-0"
                title="Retirer ce message"
              >
                Retirer
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  const { user } = useAuth();
  const [teams, setTeams] = useState([]);
  const [matches, setMatches] = useState([]);
  const [form, setForm] = useState({ homeTeamId: '', awayTeamId: '', kickoff: '', round: '', venue: '' });
  const [resultForm, setResultForm] = useState({ matchId: '', homeScore: '', awayScore: '' });
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.get('/matches/teams').then((r) => setTeams(r.data));
    api.get('/matches').then((r) => setMatches(r.data));
  }, []);

  const notify = (msg) => { setMessage(msg); setTimeout(() => setMessage(''), 3000); };

  const createMatch = async (e) => {
    e.preventDefault();
    try {
      await api.post('/matches', form);
      notify('✅ Match créé !');
      api.get('/matches').then((r) => setMatches(r.data));
    } catch (err) {
      notify('❌ ' + (err.response?.data?.error || 'Erreur'));
    }
  };

  const updateResult = async (e) => {
    e.preventDefault();
    try {
      await api.patch(`/matches/${resultForm.matchId}/result`, {
        homeScore: resultForm.homeScore,
        awayScore: resultForm.awayScore,
      });
      notify('✅ Résultat enregistré et points calculés !');
      api.get('/matches').then((r) => setMatches(r.data));
    } catch (err) {
      notify('❌ ' + (err.response?.data?.error || 'Erreur'));
    }
  };

  const pendingResults = matches.filter((m) => m.status !== 'FINISHED' && new Date() >= new Date(m.kickoff));

  /**
   * L'ecran refuse aussi, mais ce n'est pas lui qui protege.
   *
   * La page etait derriere `PrivateRoute`, qui verifie seulement qu'on est
   * connecte — pas qui on est. N'importe lequel des joueurs pouvait donc y
   * entrer et saisir un resultat, ce qui distribue les points de tout le monde.
   *
   * La vraie fermeture est cote serveur : `requireAdmin` sur les deux routes.
   * Ce garde-ci evite seulement de proposer des formulaires qui seraient
   * refuses a l'envoi — c'est de la politesse, pas de la securite. Le cacher
   * sans fermer l'API n'aurait rien protege du tout.
   */
  if (user && user.admin === false) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h1 className="font-display text-[26px] font-extrabold leading-none mb-2">Réservé à l'administration</h1>
        <p className="text-[14px] text-slate-400 leading-relaxed">
          Cette page sert à créer des matchs et à saisir des résultats. Les scores
          arrivent tout seuls, personne n'a besoin d'y toucher.
        </p>
        <p className="mt-6">
          <Link to="/" className="text-amber-500 hover:underline text-[14px]">Retour au jeu</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <h1 className="text-2xl font-bold">⚙️ Administration</h1>

      {message && (
        <div className={`p-3 rounded-lg text-sm font-medium ${message.startsWith('✅') ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
          {message}
        </div>
      )}

      {/* L'état du site, en tête : c'est ce qu'on vient chercher. */}
      <EtatDuSite />

      {/* Puis les gens : qui joue, qui dort, qui n'entre plus, et ce qui se dit
          au Comptoir. Avant les formulaires de match, qui ne servent plus qu'en
          depannage depuis que les horaires et les resultats arrivent seuls. */}
      <LesJoueurs />

      <AdressesBannies />

      <ModerationChat />

      {/* Créer un match */}
      <div className="card">
        <h2 className="font-semibold mb-4">➕ Ajouter un match</h2>
        <form onSubmit={createMatch} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Équipe domicile</label>
              <select className="input text-sm" value={form.homeTeamId} onChange={(e) => setForm({ ...form, homeTeamId: e.target.value })} required>
                <option value="">Choisir...</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Équipe extérieure</label>
              <select className="input text-sm" value={form.awayTeamId} onChange={(e) => setForm({ ...form, awayTeamId: e.target.value })} required>
                <option value="">Choisir...</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Journée</label>
              <input type="number" min="1" max="26" className="input text-sm" placeholder="1-26" value={form.round} onChange={(e) => setForm({ ...form, round: e.target.value })} required />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Date & heure</label>
              <input type="datetime-local" className="input text-sm" value={form.kickoff} onChange={(e) => setForm({ ...form, kickoff: e.target.value })} required />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Stade (optionnel)</label>
            <input type="text" className="input text-sm" placeholder="Stade Ernest-Wallon" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} />
          </div>
          <button type="submit" className="btn-primary text-sm">Créer le match</button>
        </form>
      </div>

      {/* Saisir un résultat */}
      <div className="card">
        <h2 className="font-semibold mb-4">📝 Saisir un résultat</h2>
        {pendingResults.length === 0 ? (
          <p className="text-slate-500 text-sm">Aucun match en attente de résultat.</p>
        ) : (
          <form onSubmit={updateResult} className="space-y-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Match</label>
              <select className="input text-sm" value={resultForm.matchId} onChange={(e) => setResultForm({ ...resultForm, matchId: e.target.value })} required>
                <option value="">Choisir le match...</option>
                {pendingResults.map((m) => (
                  <option key={m.id} value={m.id}>
                    J{m.round} — {m.homeTeam.shortName} vs {m.awayTeam.shortName}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-xs text-slate-400 mb-1 block">Score domicile</label>
                <input type="number" min="0" className="input text-sm text-center" value={resultForm.homeScore} onChange={(e) => setResultForm({ ...resultForm, homeScore: e.target.value })} required />
              </div>
              <span className="text-slate-500 mt-5">–</span>
              <div className="flex-1">
                <label className="text-xs text-slate-400 mb-1 block">Score extérieur</label>
                <input type="number" min="0" className="input text-sm text-center" value={resultForm.awayScore} onChange={(e) => setResultForm({ ...resultForm, awayScore: e.target.value })} required />
              </div>
            </div>
            <button type="submit" className="btn-primary text-sm">Enregistrer + calculer les points</button>
          </form>
        )}
      </div>

      {/* Stats rapides */}
      <div className="card">
        <h2 className="font-semibold mb-3">📊 Stats</h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xl font-bold text-amber-400">{matches.length}</p>
            <p className="text-xs text-slate-500">Matchs total</p>
          </div>
          <div>
            <p className="text-xl font-bold text-green-400">{matches.filter((m) => m.status === 'FINISHED').length}</p>
            <p className="text-xs text-slate-500">Terminés</p>
          </div>
          <div>
            <p className="text-xl font-bold text-blue-400">{pendingResults.length}</p>
            <p className="text-xs text-slate-500">À saisir</p>
          </div>
        </div>
      </div>
    </div>
  );
}
