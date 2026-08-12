import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import { AuthLayout } from '@/components/layout/AuthLayout';

// Real accounts from scripts/seed_dev_data.py — see BACKEND_SETUP.md.
const DEV_PASSWORD = 'DevPass123!';
const DEV_ACCOUNTS = [
  { email: 'anna.kowalska@myway.local', role: 'superuser' },
  { email: 'marek.nowak@myway.local', role: 'admin' },
  { email: 'piotr.zielinski@myway.local', role: 'admin' },
  { email: 'katarzyna.wisniewska@myway.local', role: 'receptionist (supervisor)' },
  { email: 'aleksandra.wojcik@myway.local', role: 'receptionist' },
];

/** Faithful port of templates/auth/login.html — same card/input/button classes. */
export function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isLoading && isAuthenticated) {
    const next = (location.state as { next?: string } | null)?.next;
    return <Navigate to={next ?? '/profile'} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const result = await login(email, password, remember);
    setSubmitting(false);
    if (!result.success) {
      setError(result.error ?? 'Nieprawidłowy email lub hasło.');
      return;
    }
    const next = (location.state as { next?: string } | null)?.next;
    navigate(next ?? '/profile', { replace: true });
  }

  return (
    <AuthLayout>
    <div className="max-w-md w-full mx-4">
      <div className="refined-card" style={{ padding: '2.5rem' }}>
        <div className="text-center" style={{ marginBottom: '2.5rem' }}>
          <img
            src="/logo.webp"
            alt="MyWay Nails &amp; Beauty"
            style={{ display: 'block', width: '100%', maxWidth: 200, height: 'auto', objectFit: 'contain', margin: '0 auto 0.75rem' }}
          />
          {/* Single tracked caption instead of the previous large sans-serif
              "Beauty Salon" heading, which clashed with the serif logo above
              it — now matches the sidebar's own logo+caption treatment. */}
          <p
            className="text-[13px] tracking-widest uppercase text-center"
            style={{ color: 'var(--color-ink-subtle)' }}
          >
            Beauty Salon Management
          </p>
          <div
            aria-hidden="true"
            style={{ width: '2.5rem', height: '2px', background: 'linear-gradient(90deg, var(--color-accent-deep), var(--color-accent))', margin: '0.75rem auto 0' }}
          />
        </div>

        {error && <div className="flash-message flash-error">{error}</div>}

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

          <div>
            <label htmlFor="password" className="refined-label">
              Hasło
            </label>
            <input
              type="password"
              id="password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="refined-input"
              placeholder="••••••••"
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center' }}>
            <input
              type="checkbox"
              id="remember"
              name="remember"
              className="refined-checkbox"
              style={{ marginRight: '0.5rem' }}
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <label htmlFor="remember" className="refined-checkbox-label" style={{ fontSize: '0.8125rem', color: 'var(--color-ink-muted)', fontWeight: 300 }}>
              Zapamiętaj mnie
            </label>
          </div>

          <button type="submit" className="refined-btn-brand" style={{ width: '100%', justifyContent: 'center' }} disabled={submitting}>
            {submitting ? 'Logowanie…' : 'Zaloguj się'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '0.75rem' }}>
          <Link to="/forgot-password" style={{ fontSize: '0.75rem', color: 'var(--color-ink-subtle)', textDecoration: 'none' }}>
            Nie pamiętam hasła
          </Link>
        </div>

        <div className="refined-footer">
          <p>&copy; {new Date().getFullYear()} MyWay Beauty Salon. Wszelkie prawa zastrzeżone.</p>
        </div>
      </div>

      {/* Dev-helper: seeded accounts from scripts/seed_dev_data.py, surfaced
          here rather than gated behind a DEBUG flag — mirrors the
          (originally empty) dev-helper block in the reference login.html. */}
      <div className="dev-helper">
        <p className="dev-helper-title">Dane logowania (dev seed)</p>
        <p className="dev-helper-text">
          Hasło dla każdego konta: <span className="dev-helper-code">{DEV_PASSWORD}</span>
          <br />
          {DEV_ACCOUNTS.map((u) => (
            <span key={u.email}>
              <span className="dev-helper-code">{u.email}</span> — {u.role}
              <br />
            </span>
          ))}
        </p>
      </div>
    </div>
    </AuthLayout>
  );
}
