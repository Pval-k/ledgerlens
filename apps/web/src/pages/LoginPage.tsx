import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const from =
    (location.state as { from?: string } | null)?.from && String(location.state.from).startsWith('/')
      ? (location.state as { from: string }).from
      : '/';

  if (token) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack" style={{ maxWidth: 420, margin: '0 auto' }}>
      <div className="card">
        <h2 className="card__title">Sign in</h2>
        <p className="muted" style={{ marginTop: '-0.5rem', marginBottom: '1rem' }}>
          Use your LedgerLens account to access documents and analytics.
        </p>
        <form className="stack" style={{ gap: '0.75rem' }} onSubmit={onSubmit}>
          <label className="stack" style={{ gap: '0.35rem' }}>
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              Email
            </span>
            <input
              className="input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              required
            />
          </label>
          <label className="stack" style={{ gap: '0.35rem' }}>
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              Password
            </span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              required
            />
          </label>
          {error ? <div className="alert alert-error">{error}</div> : null}
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="muted" style={{ marginTop: '1rem', marginBottom: 0 }}>
          No account? <Link to="/signup">Create one</Link>
        </p>
      </div>
    </div>
  );
}
