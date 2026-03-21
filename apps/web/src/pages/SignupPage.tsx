import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function SignupPage() {
  const navigate = useNavigate();
  const { token, signup } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (token) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signup(email.trim(), password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack" style={{ maxWidth: 420, margin: '0 auto' }}>
      <div className="card">
        <h2 className="card__title">Create account</h2>
        <p className="muted" style={{ marginTop: '-0.5rem', marginBottom: '1rem' }}>
          Password must be at least 8 characters.
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
              autoComplete="new-password"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              required
              minLength={8}
            />
          </label>
          {error ? <div className="alert alert-error">{error}</div> : null}
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Creating…' : 'Create account'}
          </button>
        </form>
        <p className="muted" style={{ marginTop: '1rem', marginBottom: 0 }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
