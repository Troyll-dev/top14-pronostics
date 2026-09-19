import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Navbar from './components/Navbar';
import WelcomePage from './pages/WelcomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import HomePage from './pages/HomePage';
import MatchesPage from './pages/MatchesPage';
import RoundPredictionsPage from './pages/RoundPredictionsPage';
import LeaderboardPage from './pages/LeaderboardPage';
import AdminPage from './pages/AdminPage';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-amber-500 text-xl animate-pulse">🏉 Chargement...</div>
      </div>
    );
  }
  return user ? children : <Navigate to="/bienvenue" />;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/" /> : children;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <div className="min-h-screen">
      {user && <Navbar />}
      <Routes>
        <Route path="/bienvenue" element={<PublicRoute><WelcomePage /></PublicRoute>} />
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
        <Route path="/" element={<PrivateRoute><HomePage /></PrivateRoute>} />
        <Route path="/pronostics" element={<PrivateRoute><MatchesPage /></PrivateRoute>} />
        <Route path="/pronos" element={<PrivateRoute><RoundPredictionsPage /></PrivateRoute>} />
        <Route path="/classement" element={<PrivateRoute><LeaderboardPage /></PrivateRoute>} />
        <Route path="/admin" element={<PrivateRoute><AdminPage /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
