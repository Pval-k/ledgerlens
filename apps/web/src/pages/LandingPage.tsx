import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function LandingPage() {
  const { token } = useAuth();

  if (token) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="stack" style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center' }}>
      <div className="card">
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>LedgerLens</h1>
        <p className="muted" style={{ marginBottom: '1.5rem' }}>
          Upload bank CSVs, normalize transactions, and explore cash-flow analytics — per account,
          securely scoped to you.
        </p>
        <div className="row" style={{ justifyContent: 'center', gap: '0.75rem' }}>
          <Link to="/login" className="btn btn-ghost">
            Sign in
          </Link>
          <Link to="/signup" className="btn btn-primary">
            Create account
          </Link>
        </div>
      </div>
    </div>
  );
}
