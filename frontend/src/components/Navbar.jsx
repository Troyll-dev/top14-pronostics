import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();

  const [theme, setTheme] = useState(
    () => document.documentElement.dataset.theme || 'creme'
  );

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

  const links = [
    { to: '/', icon: '🏠', label: 'Accueil' },
    { to: '/pronostics', icon: '📅', label: 'Mes pronos' },
    { to: '/pronos', icon: '👥', label: 'Tous les pronos' },
    { to: '/classement', icon: '🏆', label: 'Classement' },
    { to: '/admin', icon: '⚙️', label: 'Admin' },
  ];

  return (
    <nav className="nav-band sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-14 gap-2">
        <Link to="/" className="nav-tx font-display font-bold text-base tracking-wide flex items-center gap-2 shrink-0">
          <span>🏉</span>
          <span className="hidden lg:inline">Top 14 Pronos</span>
        </Link>

        <div className="flex items-center gap-0.5">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              title={l.label}
              className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                pathname === l.to
                  ? 'tab-on font-semibold shadow-[inset_0_-2px_0_rgba(0,0,0,.18)]'
                  : 'nav-dim hover:bg-white/10'
              }`}
            >
              <span>{l.icon}</span>
              <span className="hidden lg:inline">{l.label}</span>
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={toggleTheme}
            title={theme === 'nuit' ? 'Passer en clair' : 'Passer en sombre'}
            className="nav-dim hover:bg-white/10 rounded-md px-2 py-1.5 text-sm transition-colors"
          >
            {theme === 'nuit' ? '☀️' : '🌙'}
          </button>

          <div
            className="w-8 h-8 rounded-full flex items-center justify-center font-display font-bold text-sm shrink-0"
            style={{
              backgroundColor: user?.avatarColor,
              color: '#fff',
              boxShadow: '0 0 0 2px rgb(var(--a-500))',
            }}
          >
            {user?.username?.[0]?.toUpperCase()}
          </div>
          <span className="nav-tx text-sm hidden lg:block">{user?.username}</span>
          <button
            onClick={logout}
            title="Se déconnecter"
            className="nav-dim hover:text-red-400 text-sm ml-0.5 transition-colors"
          >
            ↪
          </button>
        </div>
      </div>
    </nav>
  );
}
