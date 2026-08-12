import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { api, ApiError } from '@/lib/api/client';

/**
 * Faithful port of templates/auth/reset_password.html. Calls
 * POST /api/auth/reset-password/:token — needs the Flask backend.
 */
export function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('Hasło musi mieć co najmniej 8 znaków.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Hasła nie są identyczne.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post(`/auth/reset-password/${token}`, { new_password: newPassword });
      navigate('/login', { state: { flash: 'Hasło zostało zmienione. Zaloguj się nowym hasłem.' } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Nie udało się połączyć z serwerem.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <div className="max-w-md w-full mx-4">
        <div className="refined-card" style={{ padding: '2.5rem' }}>
          <div style={{ marginBottom: '2rem' }}>
            <h1 className="refined-title">Ustaw nowe hasło</h1>
            <p className="refined-subtitle">Wprowadź i potwierdź swoje nowe hasło</p>
          </div>

          {error && <div className="flash-message flash-error">{error}</div>}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label htmlFor="new_password" className="refined-label">
                Nowe hasło
              </label>
              <input
                type="password"
                id="new_password"
                name="new_password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoFocus
                minLength={8}
                className="refined-input"
                placeholder="••••••••"
              />
              <p className="hint-text">Minimum 8 znaków</p>
            </div>

            <div>
              <label htmlFor="confirm_password" className="refined-label">
                Potwierdź hasło
              </label>
              <input
                type="password"
                id="confirm_password"
                name="confirm_password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                className="refined-input"
                placeholder="••••••••"
              />
            </div>

            <button type="submit" className="refined-btn-primary" disabled={submitting}>
              {submitting ? 'Zapisywanie…' : 'Zmień hasło'}
            </button>
          </form>

          <Link to="/forgot-password" className="back-link">
            ← Wróć do odzyskiwania hasła
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}
