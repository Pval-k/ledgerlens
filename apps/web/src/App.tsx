import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { ProtectedRoute } from './ProtectedRoute';
import { DocumentPage } from './pages/DocumentPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';

function AppHeader() {
  const { token, user, logout } = useAuth();

  return (
    <header className="app-header">
      <Link to={token ? '/' : '/login'} className="app-brand" style={{ textDecoration: 'none' }}>
        <span className="app-brand__title">LedgerLens</span>
        <span className="app-brand__sub">CSV → insights</span>
      </Link>
      <div className="app-header__actions">
        {token && user ? (
          <>
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              {user.email}
            </span>
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
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <HomePage />
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
