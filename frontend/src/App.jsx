import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Navbar, { RESERVE_BARRE_BAS } from './components/Navbar';
import JoueursDecor from './components/JoueursDecor';
import MiseAJour from './components/MiseAJour';
import WelcomePage from './pages/WelcomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import HomePage from './pages/HomePage';
import Top14Page from './pages/Top14Page';
import MatchesPage from './pages/MatchesPage';
import RoundPredictionsPage from './pages/RoundPredictionsPage';
import LeaderboardPage from './pages/LeaderboardPage';
import ChatPage from './pages/ChatPage';
import ProfilePage from './pages/ProfilePage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import AdminPage from './pages/AdminPage';
import ConfirmerEmailPage from './pages/ConfirmerEmailPage';
import BandeauVerification from './components/BandeauVerification';

/**
 * Remonter en haut a chaque changement de page.
 *
 * Sans ca, le navigateur garde la position de defilement d'une page a l'autre :
 * on quittait le classement, qui est long, a mi-hauteur, et le championnat
 * s'ouvrait au milieu de son tableau. Le titre n'avait pas disparu, il etait
 * simplement au-dessus de ce qu'on voyait — ce qui est la pire forme du defaut,
 * puisque rien n'indique qu'il faut remonter.
 *
 * C'est le comportement normal d'une application a page unique : il n'y a pas de
 * chargement de document, donc rien ne remet le defilement a zero. Un navigateur
 * le fait tout seul sur un site classique ; ici il faut le demander.
 *
 * `behavior: 'instant'` et non `smooth` : un changement de page doit etre
 * instantane. Une remontee animee sur une page longue donne une seconde de
 * defilement pendant laquelle on voit passer le contenu de la page qu'on vient
 * de quitter, ce qui ressemble a un bug.
 *
 * Le composant ne rend rien : il n'existe que pour son effet. Il est monte a
 * l'interieur du routeur, seul endroit ou `useLocation` a un sens.
 */
function HautDePage() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);
  return null;
}

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
      {/* Le bandeau de mise a jour, hors de toute route : une nouvelle version
          peut arriver a n'importe quel moment, y compris sur la page de
          connexion. */}
      <HautDePage />

      <MiseAJour />

      {user && <Navbar />}

      {/* Le rappel de confirmation d'adresse.

          Juste sous la barre de navigation, et non dans une page : il concerne
          le compte, pas l'endroit ou l'on se trouve, et il doit se voir quelle
          que soit la page ouverte. Il ne rend rien tant que l'adresse est
          confirmee — c'est-a-dire, apres la migration, pour tout le monde sauf
          les futures inscriptions. */}
      {user && <BandeauVerification />}

      {/* Le filigrane est fixe en z-0 : le contenu doit donc etre eleve
          au-dessus, sans quoi il passerait derriere les joueurs. */}
      {user && <JoueursDecor />}

      {/* Conteneur relatif, et le z-10 qui place le contenu devant le
          filigrane des joueurs.

          Il servait aussi de repere a la vignette des copains, qui etait en
          position absolue : c'est lui qui la faisait defiler avec la page au
          lieu de rester collee a l'ecran. La vignette a ete retiree, mais le
          `relative` reste — il ne coute rien et une position absolue finira
          bien par en avoir besoin. */}
      <div className="relative z-10">
        <Routes>
          <Route path="/bienvenue" element={<PublicRoute><WelcomePage /></PublicRoute>} />
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />

          {/* Liens recus par e-mail : accessibles connecte ou non, puisqu'on
              arrive souvent depuis un autre appareil. */}
          <Route path="/mot-de-passe-oublie" element={<ForgotPasswordPage />} />
          <Route path="/reinitialiser" element={<ResetPasswordPage />} />

          {/* Confirmation d'adresse : publique comme les deux lignes au-dessus,
              et pour la meme raison — on ouvre ces liens-la depuis sa boite,
              souvent sur un autre appareil que celui ou l'on s'est inscrit. */}
          <Route path="/confirmer" element={<ConfirmerEmailPage />} />
          <Route path="/" element={<PrivateRoute><HomePage /></PrivateRoute>} />
          <Route path="/pronostics" element={<PrivateRoute><MatchesPage /></PrivateRoute>} />
          <Route path="/top14" element={<PrivateRoute><Top14Page /></PrivateRoute>} />
          <Route path="/pronos" element={<PrivateRoute><RoundPredictionsPage /></PrivateRoute>} />
          <Route path="/classement" element={<PrivateRoute><LeaderboardPage /></PrivateRoute>} />
          <Route path="/chat" element={<PrivateRoute><ChatPage /></PrivateRoute>} />
          <Route path="/profil" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
          <Route path="/admin" element={<PrivateRoute><AdminPage /></PrivateRoute>} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>

        {/* Le vide sous le contenu, pour la barre d'onglets du bas.

            Elle est `fixed` : elle ne pousse donc rien et se pose par-dessus ce
            qui finit la page. Sans cette reserve, le dernier match de chaque
            liste et le dernier message du Comptoir passent dessous — visibles a
            moitie, et surtout incochables, ce qui est la forme la plus agacante
            du defaut puisqu'on voit la case qu'on n'arrive pas a atteindre.

            Un bloc vide plutot qu'un `padding-bottom` sur le conteneur : la
            hauteur depend de `env(safe-area-inset-bottom)`, qu'une classe
            Tailwind ne sait pas exprimer, et il fallait pouvoir l'annuler
            au-dessus de `lg` ou la barre du bas n'existe pas — ce qu'un style
            en ligne ne sait pas faire. `lg:hidden` sur un bloc regle les deux
            d'un coup.

            La hauteur vient de `Navbar.jsx`, qui la definit pour la barre
            elle-meme. Les deux ne peuvent donc pas se desaccorder : si la barre
            grandit un jour, ce vide grandit avec elle. */}
        {user && <div className="lg:hidden" style={{ height: RESERVE_BARRE_BAS }} />}
      </div>
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
