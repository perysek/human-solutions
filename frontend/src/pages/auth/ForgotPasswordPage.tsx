import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { api, ApiError } from '@/lib/api/client';

/**
 * Faithful port of templates/auth/forgot_password.html. Same no-email
 * methodology as the reference: the backend shows the reset link directly
 * on screen instead of sending mail (routes/auth/routes.py's
 * forgot_password()), and always returns the same neutral message so the
 * response can't be used to enumerate which emails have accounts.
 *
 * Calls POST /api/auth/forgot-password — needs the Flask backend; see
 * frontend/README.md "Wiring to a real backend".
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await api.post<{ reset_url?: string }>('/auth/forgot-password', { email });
      setResetUrl(result.reset_url ?? null);
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
            <h1 className="refined-title">Odzyskiwanie hasła</h1>
            <p className="refined-subtitle">Podaj adres email przypisany do konta</p>
          </div>

          {error && <div className="flash-message flash-error">{error}</div>}

          {resetUrl !== null ? (
            <>
              <div className="neutral-notice">
                Jeśli konto z podanym adresem istnieje, poniżej znajdziesz link do zresetowania hasła.
              </div>
              <div className="reset-link-box">
                <p className="reset-link-title">Link do resetowania hasła</p>
                <input
                  type="text"
                  className="reset-link-url"
                  value={resetUrl}
                  readOnly
                  onClick={(e) => e.currentTarget.select()}
                />
                <p className="reset-link-hint">
                  Kliknij w link lub skopiuj go i wklej w pasku adresu przeglądarki. Link jest ważny przez{' '}
                  <strong>1 godzinę</strong>.
                </p>
              </div>
              <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
                <Link
                  to={resetUrl}
                  className="refined-btn-primary"
                  style={{ display: 'inline-block', textDecoration: 'none', width: 'auto', padding: '0.625rem 1.5rem' }}
                >
                  Przejdź do formularza
                </Link>
              </div>
            </>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label htmlFor="email" className="refined-label">
                  Adres email
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="refined-input"
                  placeholder="twoj@email.pl"
                />
              </div>
              <button type="submit" className="refined-btn-primary" disabled={submitting}>
                {submitting ? 'Wysyłanie…' : 'Wyślij link resetujący'}
              </button>
            </form>
          )}

          <Link to="/login" className="back-link">
            ← Wróć do logowania
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}
