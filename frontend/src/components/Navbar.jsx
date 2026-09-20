import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import Avatar from './Avatar';

const SEEN_KEY = 't14-chat-vu';
const UNREAD_MS = 20000;

export default function Navbar() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();

  const [theme, setTheme] = useState(
    () => document.documentElement.dataset.theme || 'creme'
  );

  const [unread, setUnread] = useState(0);

  const toggleTheme = () => {
    const next = theme === 'nuit' ? 'creme' : 'nuit';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('t14-theme', next);
    } catch {
      /* navigation privée : on garde juste le thème pour la session */
    }
    setTheme(next);
  };

  /**
   * Messages non lus depuis la derniere visite du salon.
   *
   * Le repere est garde dans le navigateur ; a la premiere ouverture on le
   * pose a maintenant, pour ne pas accueillir un nouvel arrivant avec une
   * pastille a trois chiffres.
   */
  const refreshUnread = useCallback(async () => {
    if (!user) return;
    let since;
    try {
      since = localStorage.getItem(SEEN_KEY);
      if (!since) {
        since = new Date().toISOString();
        localStorage.setItem(SEEN_KEY, since);
      }
    } catch {
      since = new Date().toISOString();
    }

    try {
      const res = await api.get(`/messages/unread?since=${encodeURIComponent(since)}`);
      setUnread(res.data.count || 0);
    } catch {
      /* salon indisponible : la barre reste utilisable, sans pastille */
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    refreshUnread();
    const id = setInterval(() => { if (!document.hidden) refreshUnread(); }, UNREAD_MS);

    const onRead = () => setUnread(0);
    window.addEventListener('t14-chat-lu', onRead);

    return () => { clearInterval(id); window.removeEventListener('t14-chat-lu', onRead); };
  }, [user, refreshUnread]);

  useEffect(() => { if (pathname === '/chat') setUnread(0); }, [pathname]);

  const links = [
    { to: '/', icon: '🏠', label: 'Accueil' },
    { to: '/pronostics', icon: '📅', label: 'Mes pronos' },
    { to: '/pronos', icon: '👥', label: 'Tous les pronos' },
    { to: '/top14', icon: '🏉', label: 'Championnat' },
    { to: '/classement', icon: '🏆', label: 'Classement' },
    { to: '/chat', icon: '💬', label: 'Vestiaire', badge: unread },
    { to: '/admin', icon: '⚙️', label: 'Admin' },
  ];

  return (
    <nav className="nav-band sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-2 sm:px-4 flex items-center justify-between h-14 gap-1 sm:gap-2">
        <Link to="/" className="nav-tx font-display font-bold text-base tracking-wide flex items-center gap-2 shrink-0">
          <span>🏉</span>
          <span className="hidden lg:inline">Top 14 Pronos</span>
        </Link>

        {/* Bande d'onglets defilante.

            Sept onglets plus le theme, l'avatar et la deconnexion ne tiennent
            pas dans 375 px : la barre debordait et, comme elle est `sticky`,
            c'est toute la page qui se decalait — il fallait la tirer a la main
            pour atteindre la deconnexion.

            `min-w-0` autorise cette bande a se retrecir : sans lui, une boite
            flex refuse de descendre sous la largeur de son contenu et pousse
            le reste dehors. `overflow-x-auto` la fait alors defiler seule, et
            le defilement etant interne, la deconnexion reste en dehors, donc
            toujours visible. La barre du defileur est masquee : on fait
            glisser au doigt.

            L'interieur est en `w-max mx-auto` : centre quand tout tient,
            defilable depuis le debut quand ca deborde.

            A partir de `lg` les libelles apparaissent et la barre retrouve
            exactement son comportement d'origine : pas de retrecissement, pas
            de defilement interne. C'est deliberé — sur grand ecran tout
            s'affiche deja, et une bande defilante y cacherait des onglets qui
            etaient visibles. */}
        <div className="flex-1 min-w-0 overflow-x-auto lg:flex-none lg:min-w-fit lg:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex items-center gap-0.5 w-max mx-auto">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              title={l.label}
              className={`relative shrink-0 flex items-center gap-1.5 px-1.5 sm:px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                pathname === l.to
                  ? 'tab-on font-semibold shadow-[inset_0_-2px_0_rgba(0,0,0,.18)]'
                  : 'nav-dim hover:bg-white/10'
              }`}
            >
              <span>{l.icon}</span>
              <span className="hidden lg:inline">{l.label}</span>

              {l.badge > 0 && pathname !== l.to && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full
                                 bg-red-500 text-white font-display text-[10px] font-bold leading-[17px]
                                 text-center tabular-nums">
                  {l.badge > 99 ? '99' : l.badge}
                </span>
              )}
            </Link>
          ))}
        </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <button
            onClick={toggleTheme}
            title={theme === 'nuit' ? 'Passer en clair' : 'Passer en sombre'}
            className="nav-dim hover:bg-white/10 rounded-md px-1.5 sm:px-2 py-1.5 text-sm transition-colors"
          >
            {theme === 'nuit' ? '☀️' : '🌙'}
          </button>

          {/* La pastille mène au profil : c'est l'endroit où on la cherche. */}
          <Link
            to="/profil"
            title="Mon profil"
            className="flex items-center gap-2 rounded-md px-0.5 sm:px-1 py-1 hover:bg-white/10 transition-colors shrink-0"
          >
            <Avatar user={user} size={32} />
            <span className="nav-tx text-sm hidden lg:block">{user?.username}</span>
          </Link>

          <button
            onClick={logout}
            title="Se déconnecter"
            className="nav-dim hover:text-red-400 text-sm px-1 shrink-0 transition-colors"
          >
            ↪
          </button>
        </div>
      </div>
    </nav>
  );
}
