import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { ProtectedRoute } from './ProtectedRoute';
import { AccountSettingsPage } from './pages/AccountSettingsPage';
import { DocumentPage } from './pages/DocumentPage';
import { HomePage } from './pages/HomePage';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';

function AppHeader() {
  const { token, user, logout } = useAuth();
  const displayName =
    user?.name?.trim() ||
    (user?.email ? user.email.split('@')[0] : null);

  return (
    <header className="app-header">
      <Link
        to={token ? '/dashboard' : '/'}
        className="app-brand"
        style={{ textDecoration: 'none' }}
      >
        <span className="app-brand__title">LedgerLens</span>
        <span className="app-brand__sub">CSV → insights</span>
      </Link>
      <div className="app-header__actions">
        {token && user ? (
          <>
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              {displayName ?? user.email}
            </span>
            <Link to="/settings" className="btn btn-ghost">
              Account
            </Link>
            <button type="button" className="btn btn-ghost" onClick={logout}>
              Sign out
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="btn btn-ghost">
              Sign in
            </Link>
            <Link to="/signup" className="btn btn-primary">
              Sign up
            </Link>
          </>
        )}
      </div>
    </header>
  );
}

export function App() {
  return (
    <div className="app-shell">
      <AppHeader />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <HomePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <AccountSettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/documents/:id"
            element={
              <ProtectedRoute>
                <DocumentPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
