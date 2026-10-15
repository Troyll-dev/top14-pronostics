import { useState, useEffect, useRef, useCallback } from 'react';
import { format, isToday, isYesterday, isSameDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import Avatar from '../components/Avatar';
import Bandeau from '../components/Bandeau';
import ChoixEmoji from '../components/ChoixEmoji';

const POLL_MS = 6000;
const MAX_LENGTH = 1000;

/** Le Comptoir porte le numéro de fil 0 : ce n'est l'identifiant de personne. */
const COMPTOIR = 0;

// Deux messages du meme auteur a moins de cinq minutes d'intervalle sont
// regroupes : on n'affiche le pseudo et la pastille qu'une fois.
const GROUP_MS = 5 * 60 * 1000;

/**
 * Le Comptoir, et les conversations privées.
 *
 * ---------------------------------------------------------------------------
 * UNE SEULE PAGE POUR DEUX USAGES
 * ---------------------------------------------------------------------------
 *
 * La page ne montre qu'un fil à la fois, et une rangée en tête permet d'en
 * changer : le Comptoir d'abord, puis un rang par copain. Tout le reste — les
 * bulles, le regroupement par auteur, les séparateurs de jour, la saisie, le
 * recollage en bas — sert les deux formes sans être écrit deux fois.
 *
 * C'est la contrepartie du choix fait côté serveur : un message privé est un
 * message ordinaire avec un destinataire. Si l'écran avait eu deux pages, il
 * aurait fallu dupliquer tout ce qui précède, et ces deux copies auraient
 * divergé au premier correctif — exactement comme les quatre bandeaux avant
 * qu'ils ne deviennent un composant.
 *
 * ---------------------------------------------------------------------------
 * LA LECTURE EST EN BASE, PLUS DANS LE NAVIGATEUR
 * ---------------------------------------------------------------------------
 *
 * La date de dernière lecture vivait dans `localStorage`. On lisait sur son
 * téléphone, le PC gardait sa pastille — supportable avec un seul salon,
 * intenable avec huit fils. Elle est désormais enregistrée par le serveur,
 * fil par fil, et l'écran l'annonce en deux occasions : à l'ouverture d'un fil,
 * et quand un message y arrive pendant qu'on le regarde.
 *
 * L'évènement `t14-chat-lu` reste, mais il ne dit plus « tout est lu » : il dit
 * « quelque chose a changé, recompte ». C'est la barre de navigation qui
 * recompte, parce qu'elle seule sait ce qu'elle affiche — lire un fil ne vide
 * pas la pastille s'il en reste un autre non lu.
 */
export function signalerLecture() {
  window.dispatchEvent(new CustomEvent('t14-chat-lu'));
}

function daySeparator(date) {
  if (isToday(date)) return "Aujourd'hui";
  if (isYesterday(date)) return 'Hier';
  return format(date, 'EEEE d MMMM', { locale: fr });
}

/**
 * De quoi savoir si la liste a vraiment change.
 *
 * L'interrogation du serveur rend un nouveau tableau toutes les six secondes,
 * meme quand personne n'a rien dit. Pour React, un nouveau tableau est un
 * changement : tout effet qui depend de `messages` repart donc six fois par
 * minute, qu'il y ait du nouveau ou non. Cette empreinte — le fil regarde, le
 * nombre de messages et l'identifiant du dernier — ne change, elle, que
 * lorsqu'il s'est reellement passe quelque chose.
 */
function empreinte(fil, messages) {
  if (!messages.length) return `${fil}:vide`;
  return `${fil}:${messages.length}:${messages[messages.length - 1].id}`;
}

/** La pastille des non-lus d'un fil. */
function Pastille({ n }) {
  if (!n) return null;
  return (
    <span className="min-w-[17px] h-[17px] px-1 rounded-full bg-red-500 text-white
                     font-display text-[10px] font-bold leading-[17px] text-center tabular-nums">
      {n > 99 ? '99' : n}
    </span>
  );
}

export default function ChatPage() {
  const { user } = useAuth();

  const [fil, setFil] = useState(COMPTOIR);
  const [fils, setFils] = useState(null);

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const scrollerRef = useRef(null);
  const saisieRef = useRef(null);
  // On ne recolle en bas que si l'on y etait deja : sinon relire un vieux
  // message serait impossible, la liste sauterait a chaque interrogation.
  const stick = useRef(true);

  // Les deux effets ci-dessous ne doivent agir que sur du nouveau. Chacun garde
  // sa propre empreinte : avec une seule partagee, le premier a s'executer
  // la mettrait a jour et le second ne ferait jamais rien.
  const vuDefilement = useRef(null);
  const vuLecture = useRef(null);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    stick.current = el.scrollTop < 80;
  };

  const chargerFils = useCallback(async () => {
    try {
      const res = await api.get('/messages/fils');
      setFils(res.data);
    } catch {
      /* liste indisponible : on reste sur le fil ouvert, sans rangee */
    }
  }, []);

  const fetchMessages = useCallback(async (quelFil) => {
    try {
      const res = await api.get(
        quelFil === COMPTOIR ? '/messages?limit=100' : `/messages?avec=${quelFil}&limit=100`
      );
      setMessages(res.data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  /**
   * L'interrogation régulière.
   *
   * Les messages du fil ouvert toutes les six secondes, la liste des fils une
   * fois sur deux : elle coûte une requête par copain côté serveur, et son seul
   * rôle est de faire apparaître une pastille — douze secondes de retard sur
   * une conversation qu'on ne regarde pas ne gênent personne.
   *
   * Rien ne part quand l'onglet est en arrière-plan, et tout repart au retour —
   * le même réglage que partout ailleurs dans l'application.
   */
  useEffect(() => {
    let alive = true;
    let tour = 0;

    const tick = async () => {
      if (document.hidden) return;
      await fetchMessages(fil);
      if (tour % 2 === 0) await chargerFils();
      tour++;
      if (alive) setLoading(false);
    };

    setLoading(true);
    tick();
    const id = setInterval(tick, POLL_MS);
    const onVisible = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fil, fetchMessages, chargerFils]);

  /**
   * « J'ai lu ce fil. »
   *
   * Déclenché à l'ouverture et à chaque arrivée réelle de message. La garde sur
   * l'empreinte est ce qui évite d'écrire en base toutes les six secondes sans
   * raison — c'est le même piège que pour le défilement, et il coûtait ici une
   * requête d'écriture plutôt qu'un sursaut d'affichage.
   */
  useEffect(() => {
    const e = empreinte(fil, messages);
    if (e === vuLecture.current) return;
    vuLecture.current = e;

    api.post('/messages/lu', { fil })
      .then(() => {
        signalerLecture();
        // La rangée doit perdre sa pastille tout de suite : attendre le
        // prochain tour donnerait l'impression que le clic n'a rien fait.
        setFils((f) => {
          if (!f) return f;
          if (fil === COMPTOIR) {
            return { ...f, comptoir: { ...f.comptoir, nonLus: 0 }, total: f.total - f.comptoir.nonLus };
          }
          const avant = f.prives.find((p) => p.fil === fil)?.nonLus || 0;
          return {
            ...f,
            prives: f.prives.map((p) => (p.fil === fil ? { ...p, nonLus: 0 } : p)),
            total: f.total - avant,
          };
        });
      })
      .catch(() => { /* sans consequence : la pastille se corrigera au prochain tour */ });
  }, [fil, messages]);

  /**
   * Recoller en haut de la conversation.
   *
   * `scrollTop` sur le cadre lui-même, et surtout pas `scrollIntoView` : ce
   * dernier remonte toute la chaîne des parents défilables jusqu'à la fenêtre,
   * et déplacerait donc la page entière.
   *
   * L'empreinte évite le défaut de la version d'origine : l'effet repartait six
   * fois par minute, y compris pendant qu'on écrivait, parce que
   * l'interrogation rend un nouveau tableau même quand rien n'a changé.
   */
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !messages.length) return;

    const e = empreinte(fil, messages);
    if (e === vuDefilement.current) return;
    vuDefilement.current = e;

    if (stick.current) el.scrollTop = 0;
  }, [fil, messages]);

  const ouvrir = (nouveau) => {
    if (nouveau === fil) return;
    setMessages([]);
    setDraft('');
    setError('');
    stick.current = true;
    setFil(nouveau);
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;

    setSending(true);
    setError('');
    try {
      const res = await api.post('/messages', {
        body,
        ...(fil === COMPTOIR ? {} : { destinataireId: fil }),
      });
      setDraft('');
      stick.current = true;
      // On insere tout de suite plutot que d'attendre la prochaine
      // interrogation : l'envoi doit paraitre instantane.
      setMessages((prev) => (prev.some((m) => m.id === res.data.id) ? prev : [...prev, res.data]));
      chargerFils();
    } catch (err) {
      setError(err.response?.data?.error || 'Envoi impossible');
    } finally {
      setSending(false);
    }
  };

  const remove = async (id) => {
    const before = messages;
    setMessages((prev) => prev.filter((m) => m.id !== id));
    try {
      await api.delete(`/messages/${id}`);
      chargerFils();
    } catch {
      setMessages(before);
      setError('Suppression impossible');
    }
  };

  /**
   * Poser un emoji là où est le curseur.
   *
   * Et pas en bout de texte : on ajoute souvent un emoji au milieu d'une phrase
   * qu'on vient de relire, et un panneau qui recolle tout à la fin oblige à
   * retaper. La position est relue sur le champ lui-même — React ne la connaît
   * pas, elle appartient au navigateur.
   *
   * Le curseur est ensuite reposé juste après l'emoji, et le champ reprend la
   * main : sans ça, la frappe suivante repartirait du début du texte, ce qui
   * est le genre de détail qu'on ne remarque qu'en l'ayant vécu.
   */
  const poserEmoji = (emoji) => {
    const champ = saisieRef.current;
    const debut = champ?.selectionStart ?? draft.length;
    const fin = champ?.selectionEnd ?? draft.length;

    const texte = (draft.slice(0, debut) + emoji + draft.slice(fin)).slice(0, MAX_LENGTH);
    setDraft(texte);

    requestAnimationFrame(() => {
      if (!champ) return;
      champ.focus();
      const ou = Math.min(debut + emoji.length, texte.length);
      champ.setSelectionRange(ou, ou);
    });
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const left = MAX_LENGTH - draft.length;

  /*
   * Du plus recent au plus ancien.
   *
   * Le serveur rend les messages dans l'ordre chronologique — c'est l'ordre
   * naturel d'une conversation, et celui que toute autre vue attendrait. C'est
   * donc ici, et seulement ici, qu'on le retourne : la copie evite de modifier
   * le tableau rendu par l'interrogation, que deux autres effets relisent.
   */
  const liste = [...messages].reverse();

  const interlocuteur = fils?.prives?.find((p) => p.fil === fil) || null;
  const prive = fil !== COMPTOIR;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Le bandeau du Comptoir : la tablée du pub, vue depuis le bar.

          En 16/9, comme l'accueil, le classement et la page de bienvenue. La
          version précédente était en 4/3 — la proportion de son image, gardée
          telle quelle pour ne couper aucun visage —, et elle coûtait les trois
          quarts de la largeur en hauteur : sur téléphone, il fallait défiler
          avant d'atteindre quoi que ce soit. Celle-ci est cadrée large dès
          l'origine, donc la proportion commune suffit et le site retrouve son
          bandeau unique.

          Plus de classe `bandeau-comptoir` : elle servait de repère à
          PhotoCopains.css pour descendre la vignette des copains de la hauteur
          d'un 4/3. Le bandeau étant redevenu un 16/9 comme les autres, la règle
          générale s'applique de nouveau, et l'exception disparaît des deux
          côtés. */}
      <Bandeau nom="comptoir-pub" className="mb-5" />

      <h1 className="font-display text-[26px] font-extrabold leading-none mb-1">
        {prive ? interlocuteur?.username || 'Conversation' : '💬 Le Comptoir'}
      </h1>
      <p className="text-xs italic text-slate-500 mb-4">
        {prive
          ? 'Entre vous deux · personne d’autre ne lit cette conversation'
          : `Entre nous · ${messages.length} message${messages.length > 1 ? 's' : ''}`}
      </p>

      {/* La rangée des fils.

          Elle défile horizontalement sur téléphone plutôt que de se replier sur
          plusieurs lignes : huit rangs empilés pousseraient la conversation
          sous la ligne de flottaison, alors que c'est elle qu'on vient lire. Le
          Comptoir reste en tête, toujours à la même place.

          Le rang porte la pastille du joueur et son nombre de non-lus. Un
          joueur en pause reste dans la liste, en grisé : il peut revenir, et sa
          conversation ne disparaît pas avec son activité. */}
      {fils && (
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 -mx-1 px-1">
          <button
            onClick={() => ouvrir(COMPTOIR)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[12.5px] font-display font-semibold transition-colors ${
              fil === COMPTOIR
                ? 'chip-accent border-transparent'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-amber-500 hover:text-white'
            }`}
          >
            Le Comptoir
            <Pastille n={fils.comptoir.nonLus} />
          </button>

          {fils.prives.map((p) => (
            <button
              key={p.fil}
              onClick={() => ouvrir(p.fil)}
              title={p.enPause ? `${p.username} est en pause` : `Écrire à ${p.username}`}
              className={`shrink-0 flex items-center gap-1.5 pl-1.5 pr-3 py-1 rounded-full border text-[12.5px] font-display font-semibold transition-colors ${
                fil === p.fil
                  ? 'chip-accent border-transparent'
                  : `bg-slate-900 border-slate-800 hover:border-amber-500 hover:text-white ${
                      p.enPause ? 'text-slate-600' : 'text-slate-400'
                    }`
              }`}
            >
              <Avatar user={p} size={22} />
              {p.username}
              <Pastille n={p.nonLus} />
            </button>
          ))}
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        {/* La saisie, en tete de la carte.

            Elle etait en bas, comme dans toute messagerie. Deux raisons de
            l'avoir remontee, et elles tiennent a cette page-ci plutot qu'a une
            mode : le bandeau occupe les trois quarts de la largeur en hauteur,
            donc sur telephone on defile deja pour atteindre la conversation —
            autant tomber directement sur ce qui permet d'ecrire. Et le clavier
            du telephone ne peut plus pousser la zone de saisie hors de l'ecran,
            puisqu'elle n'est plus au bord inferieur.

            Ce qu'on accepte en echange : une conversation qui se lit a
            l'envers, les reponses au-dessus de ce a quoi elles repondent. Sur
            un salon ou l'on vient voir ce qui est nouveau, c'est l'arbitrage
            des forums, et il se tient. */}
        <div className="border-b border-slate-800 p-3">
          <div className="flex items-end gap-2">
            {/* Seize pixels sur telephone, et ce n'est pas un choix esthetique.

                iOS applique une regle sans exception : quand le curseur entre
                dans un champ dont le texte fait moins de 16 pixels, Safari
                zoome la page pour le rendre lisible. A 13,5 pixels, ecrire un
                message agrandissait donc tout le site — et comme l'application
                installee n'a ni barre d'adresse ni geste pour revenir en
                arriere, le zoom restait.

                Au-dela de `sm` — donc sur tablette et ordinateur, ou aucun
                clavier ne s'ouvre et ou ce zoom n'existe pas — on revient a
                13,5 pixels, qui est la taille des bulles de la conversation. */}
            <textarea
              ref={saisieRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_LENGTH))}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder={
                prive
                  ? `Ton message à ${interlocuteur?.username || ''}… (Entrée pour envoyer)`
                  : 'Ton message… (Entrée pour envoyer)'
              }
              className="flex-1 resize-none bg-slate-950 border-[1.5px] border-slate-800 rounded-md px-3 py-2
                         text-[16px] sm:text-[13.5px] text-white placeholder:text-slate-600
                         focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/25 transition-colors"
            />
            <ChoixEmoji onChoix={poserEmoji} disabled={sending} />

            <button
              onClick={send}
              disabled={sending || !draft.trim()}
              className="btn-primary text-[13px] py-2 shrink-0"
            >
              {sending ? '…' : 'Envoyer'}
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 mt-1.5 text-[11px]">
            <span className="text-red-400">{error}</span>
            <span className={left < 100 ? 'text-amber-500' : 'text-slate-600'}>
              {left < 100 ? `${left} caractères restants` : 'Maj + Entrée pour aller à la ligne'}
            </span>
          </div>
        </div>
        <div
          ref={scrollerRef}
          onScroll={onScroll}
          className="max-h-[60vh] min-h-[280px] overflow-y-auto px-4 py-4"
        >
          {loading ? (
            <p className="text-center py-12 text-slate-500 animate-pulse">Chargement…</p>
          ) : messages.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-500">
                {prive
                  ? `Rien d’échangé avec ${interlocuteur?.username || 'ce joueur'}.`
                  : 'Personne n’a encore rien dit.'}
              </p>
              <p className="text-slate-600 text-sm mt-1">
                {prive ? 'Écris-lui le premier.' : 'À toi d’ouvrir le bal 🏉'}
              </p>
            </div>
          ) : (
            liste.map((m, i) => {
              /*
               * Les voisins changent de sens en meme temps que la liste.
               *
               * `avant` est le message situe juste au-dessus a l'ecran, donc le
               * PLUS RECENT des deux — l'inverse de ce que le nom suggererait
               * dans une liste chronologique, d'ou ce commentaire.
               *
               * Le separateur de jour s'affiche au-dessus du premier message
               * d'une journee rencontre en descendant : « Aujourd'hui » tout en
               * haut, puis « Hier » quand on franchit la limite en remontant le
               * temps.
               *
               * L'en-tete — pseudo et heure — se pose sur le message le plus
               * recent d'un groupe, c'est-a-dire celui du haut. C'est la
               * transposition fidele de la regle d'origine, qui la posait sur le
               * premier message du groupe tel qu'il apparaissait.
               */
              const avant = liste[i - 1];
              const date = new Date(m.createdAt);
              const newDay = !avant || !isSameDay(date, new Date(avant.createdAt));
              const grouped =
                !newDay &&
                avant &&
                avant.user.id === m.user.id &&
                new Date(avant.createdAt) - date < GROUP_MS;

              const isMe = m.user.id === user?.id;

              return (
                <div key={m.id}>
                  {newDay && (
                    <div className="flex items-center gap-3 my-4">
                      <span className="flex-1 h-px bg-slate-800" />
                      <span className="font-display text-[10.5px] font-bold uppercase tracking-wider text-slate-500 first-letter:uppercase">
                        {daySeparator(date)}
                      </span>
                      <span className="flex-1 h-px bg-slate-800" />
                    </div>
                  )}

                  <div className={`flex gap-2.5 ${grouped ? 'mt-0.5' : 'mt-3'} ${isMe ? 'flex-row-reverse' : ''}`}>
                    {/* La pastille du profil, et non plus une copie dessinee
                        a la main. Celle-ci ignorait la photo, les initiales
                        choisies et le lisere : tout le monde se retrouvait
                        avec la pastille par defaut. */}
                    <div className="w-7 shrink-0">
                      {!grouped && <Avatar user={m.user} size={28} />}
                    </div>

                    <div className={`min-w-0 max-w-[78%] ${isMe ? 'text-right' : ''}`}>
                      {!grouped && (
                        <div className={`flex items-baseline gap-2 mb-1 ${isMe ? 'justify-end' : ''}`}>
                          <span className="font-display font-bold text-[12.5px] truncate">
                            {isMe ? 'Toi' : m.user.username}
                          </span>
                          <span className="text-[10.5px] text-slate-600 shrink-0">
                            {format(date, 'HH:mm')}
                          </span>
                        </div>
                      )}

                      <div className={`group inline-flex items-start gap-1.5 ${isMe ? 'flex-row-reverse' : ''}`}>
                        <p
                          className={`px-3 py-2 rounded-lg text-[13.5px] leading-relaxed whitespace-pre-wrap break-words text-left ${
                            isMe
                              ? 'bg-amber-500/20 border border-amber-500/40'
                              : 'bg-slate-800/60 border border-slate-800'
                          }`}
                        >
                          {m.body}
                        </p>

                        {isMe && (
                          <button
                            onClick={() => remove(m.id)}
                            title="Supprimer"
                            className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-slate-600 hover:text-red-400 text-[11px] mt-2 transition-opacity"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>

      <p className="text-[11px] italic text-slate-600 mt-4">
        {/* La note de bas de page dit d'abord l'ordre, parce que c'est la seule
            chose qui surprenne : partout ailleurs, le dernier message est en
            bas. Le reste — la relecture automatique, la mise en veille, la
            suppression de ses propres messages — repond aux questions qu'on se
            pose ensuite. */}
        {prive
          ? 'Les messages les plus récents sont en haut. Cette conversation n’est lisible que par vous deux — pas même depuis l’administration — et chacun peut retirer les siens.'
          : 'Les messages les plus récents sont en haut. Le salon se rafraîchit tout seul toutes les six secondes et se met en veille quand l’onglet est en arrière-plan. Chacun peut retirer ses propres messages.'}
      </p>
    </div>
  );
}
