import { useState, useEffect, useRef, useCallback } from 'react';
import { format, isToday, isYesterday, isSameDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import Avatar from '../components/Avatar';

const SEEN_KEY = 't14-chat-vu';
const POLL_MS = 6000;
const MAX_LENGTH = 1000;

// Deux messages du meme auteur a moins de cinq minutes d'intervalle sont
// regroupes : on n'affiche le pseudo et la pastille qu'une fois.
const GROUP_MS = 5 * 60 * 1000;

export function markChatSeen(at) {
  try {
    localStorage.setItem(SEEN_KEY, new Date(at).toISOString());
  } catch {
    /* stockage indisponible : la pastille restera, sans consequence */
  }
  window.dispatchEvent(new CustomEvent('t14-chat-lu'));
}

function daySeparator(date) {
  if (isToday(date)) return "Aujourd'hui";
  if (isYesterday(date)) return 'Hier';
  return format(date, 'EEEE d MMMM', { locale: fr });
}

export default function ChatPage() {
  const { user } = useAuth();

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const bottomRef = useRef(null);
  const scrollerRef = useRef(null);
  // On ne recolle en bas que si l'on y etait deja : sinon relire un vieux
  // message serait impossible, la liste sauterait a chaque interrogation.
  const stick = useRef(true);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const fetchMessages = useCallback(async () => {
    try {
      const res = await api.get('/messages?limit=100');
      setMessages(res.data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    let alive = true;

    const tick = async () => {
      if (document.hidden) return;
      await fetchMessages();
      if (alive) setLoading(false);
    };

    tick();
    const id = setInterval(tick, POLL_MS);
    const onVisible = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchMessages]);

  // Tant que la page est ouverte, tout ce qui arrive est considere comme lu.
  useEffect(() => {
    if (!messages.length) return;
    markChatSeen(messages[messages.length - 1].createdAt);
  }, [messages]);

  useEffect(() => {
    if (stick.current) bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;

    setSending(true);
    setError('');
    try {
      const res = await api.post('/messages', { body });
      setDraft('');
      stick.current = true;
      // On insere tout de suite plutot que d'attendre la prochaine
      // interrogation : l'envoi doit paraitre instantane.
      setMessages((prev) => (prev.some((m) => m.id === res.data.id) ? prev : [...prev, res.data]));
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
    } catch {
      setMessages(before);
      setError('Suppression impossible');
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const left = MAX_LENGTH - draft.length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-display text-[26px] font-extrabold leading-none mb-1">💬 Le vestiaire</h1>
      <p className="text-xs italic text-slate-500 mb-5">
        Entre nous · {messages.length} message{messages.length > 1 ? 's' : ''}
      </p>

      <div className="card p-0 overflow-hidden">
        <div
          ref={scrollerRef}
          onScroll={onScroll}
          className="max-h-[60vh] min-h-[280px] overflow-y-auto px-4 py-4"
        >
          {loading ? (
            <p className="text-center py-12 text-slate-500 animate-pulse">Chargement…</p>
          ) : messages.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-500">Personne n’a encore rien dit.</p>
              <p className="text-slate-600 text-sm mt-1">À toi d’ouvrir le bal 🏉</p>
            </div>
          ) : (
            messages.map((m, i) => {
              const prev = messages[i - 1];
              const date = new Date(m.createdAt);
              const newDay = !prev || !isSameDay(date, new Date(prev.createdAt));
              const grouped =
                !newDay &&
                prev &&
                prev.user.id === m.user.id &&
                date - new Date(prev.createdAt) < GROUP_MS;

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
          <div ref={bottomRef} />
        </div>

        {/* Saisie */}
        <div className="border-t border-slate-800 p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_LENGTH))}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder="Ton message… (Entrée pour envoyer)"
              className="flex-1 resize-none bg-slate-950 border-[1.5px] border-slate-800 rounded-md px-3 py-2
                         text-[13.5px] text-white placeholder:text-slate-600
                         focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/25 transition-colors"
            />
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
      </div>

      <p className="text-[11px] italic text-slate-600 mt-4">
        Le salon se rafraîchit tout seul toutes les six secondes, et se met en veille quand
        l’onglet est en arrière-plan. Chacun peut retirer ses propres messages.
      </p>
    </div>
  );
}
