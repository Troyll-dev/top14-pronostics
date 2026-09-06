import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Navbar() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();

  const links = [
    { to: '/', label: '📅 Pronostics' },
    { to: '/classement', label: '🏆 Classement' },
    { to: '/admin', label: '⚙️ Admin' },
  ];

  return (
    <nav className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50">
      <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-14">
        <Link to="/" className="flex items-center gap-2 font-bold text-amber-400 text-lg">
          🏉 Top 14 Pronos
        </Link>

        <div className="flex items-center gap-1">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                pathname === l.to
                  ? 'bg-amber-500 text-black'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
            style={{ backgroundColor: user?.avatarColor }}
          >
            {user?.username?.[0]?.toUpperCase()}
          </div>
          <span className="text-slate-300 text-sm hidden sm:block">{user?.username}</span>
          <button onClick={logout} className="text-slate-400 hover:text-red-400 text-sm ml-1 transition-colors">
            ↪
          </button>
        </div>
      </div>
    </nav>
  );
}
