import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function AccountSettingsPage() {
  const { changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (newPassword !== newPasswordConfirm) {
      setError('New passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await changePassword({
        currentPassword,
        newPassword,
        newPasswordConfirm,
      });
      setCurrentPassword('');
      setNewPassword('');
      setNewPasswordConfirm('');
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack" style={{ maxWidth: 420, margin: '0 auto' }}>
      <div className="row" style={{ marginBottom: '0.25rem' }}>
        <Link to="/dashboard" className="muted" style={{ fontSize: '0.875rem' }}>
          ← Dashboard
        </Link>
      </div>
      <div className="card">
        <h2 className="card__title">Account &amp; security</h2>
        <p className="muted" style={{ marginTop: '-0.5rem', marginBottom: '1rem' }}>
          Change your password. You’ll stay signed in after a successful update.
        </p>
        <form className="stack" style={{ gap: '0.75rem' }} onSubmit={onSubmit}>
          <label className="stack" style={{ gap: '0.35rem' }}>
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              Current password
            </span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(ev) => setCurrentPassword(ev.target.value)}
              required
            />
          </label>
          <label className="stack" style={{ gap: '0.35rem' }}>
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              New password
            </span>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(ev) => setNewPassword(ev.target.value)}
              required
              minLength={8}
            />
          </label>
          <label className="stack" style={{ gap: '0.35rem' }}>
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              Retype new password
            </span>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={newPasswordConfirm}
              onChange={(ev) => setNewPasswordConfirm(ev.target.value)}
              required
              minLength={8}
            />
          </label>
          {error ? <div className="alert alert-error">{error}</div> : null}
          {success ? (
            <div
              className="alert"
              style={{
                background: 'var(--success-muted)',
                color: 'var(--success)',
                border: '1px solid rgba(5, 150, 105, 0.25)',
              }}
            >
              Password updated.
            </div>
          ) : null}
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Saving…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  );
}
