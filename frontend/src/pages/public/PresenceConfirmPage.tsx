import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button } from '@/components/ui/Button';
import { api, ApiError } from '@/lib/api/client';

/**
 * Mobile presence confirmation — MOBILE_PRESENCE_CONFIRMATION_PLAN.md §5.3.
 * Replaces the printed "lista obecności" + wet signature: an employee scans
 * the QR a trainer displays, opens this page on their own phone (no login,
 * no app install — same tier as ResetPasswordPage.tsx, outside
 * ProtectedRoute/AppShell), picks their own row, and confirms.
 *
 * Structurally mirrors ResetPasswordPage.tsx (AuthLayout + refined-* form
 * classes, api/ApiError from the shared client) but with three states
 * instead of one form, and a tap-to-select roster instead of text inputs.
 */

type Participant = { id: number; display_name: string; confirmed: boolean };
type Roster = { training: { description: string; training_date: string | null }; participants: Participant[] };

export function PresenceConfirmPage() {
  const { token } = useParams<{ token: string }>();

  const [roster, setRoster] = useState<Roster | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [employeeId, setEmployeeId] = useState('');
  const [signatureName, setSignatureName] = useState('');
  const [consent, setConsent] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .get<Roster>(`/public/sign-in/${token}`)
      .then((r) => setRoster(r))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Nie udało się połączyć z serwerem.'))
      .finally(() => setLoading(false));
  }, [token]);

  const selected = roster?.participants.find((p) => p.id === selectedId) ?? null;
  const canSubmit = selectedId !== null && employeeId.trim() !== '' && signatureName.trim() !== '' && consent;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !canSubmit) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      await api.post(`/public/sign-in/${token}/confirm`, {
        participant_id: selectedId,
        employee_id: employeeId.trim(),
        signature_name: signatureName.trim(),
        consent_ack: consent,
      });
      setDone(true);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Nie udało się połączyć z serwerem.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <div className="max-w-md w-full mx-4">
        <div className="refined-card" style={{ padding: '2rem 1.5rem' }}>
          {loading && (
            <p className="refined-subtitle" style={{ textAlign: 'center' }}>
              Wczytywanie…
            </p>
          )}

          {!loading && loadError && (
            <>
              <h1 className="refined-title">Nie można otworzyć listy</h1>
              <div className="flash-message flash-error" style={{ marginTop: '1rem' }}>
                {loadError}
              </div>
              <p className="hint-text" style={{ marginTop: '0.75rem' }}>
                Poproś osobę prowadzącą szkolenie o nowy link/kod QR.
              </p>
            </>
          )}

          {!loading && !loadError && roster && done && (
            <>
              <h1 className="refined-title">Potwierdzono ✓</h1>
              <p className="refined-subtitle">
                Dziękujemy, {signatureName}. Twoja obecność na szkoleniu „{roster.training.description}" została
                zarejestrowana.
              </p>
            </>
          )}

          {!loading && !loadError && roster && !done && (
            <>
              <div style={{ marginBottom: '1.5rem' }}>
                <h1 className="refined-title">Potwierdzenie obecności</h1>
                <p className="refined-subtitle">
                  {roster.training.description}
                  {roster.training.training_date ? ` — ${roster.training.training_date}` : ''}
                </p>
              </div>

              {!selected ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <p className="refined-label" style={{ marginBottom: '0.25rem' }}>
                    Znajdź swoje imię i nazwisko na liście:
                  </p>
                  {roster.participants.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => !p.confirmed && setSelectedId(p.id)}
                      disabled={p.confirmed}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        padding: '0.875rem 1rem',
                        fontSize: '1rem',
                        textAlign: 'left',
                        borderRadius: 'var(--radius-md, 8px)',
                        border: '1px solid var(--color-border)',
                        background: p.confirmed ? 'var(--color-surface-warm)' : 'var(--color-surface-elevated)',
                        color: p.confirmed ? 'var(--color-ink-subtle)' : 'var(--color-ink)',
                        cursor: p.confirmed ? 'default' : 'pointer',
                      }}
                    >
                      <span>{p.display_name}</span>
                      {p.confirmed && <span style={{ fontSize: '0.8125rem' }}>potwierdzono ✓</span>}
                    </button>
                  ))}
                </div>
              ) : (
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div
                    style={{
                      padding: '0.875rem 1rem',
                      borderRadius: 'var(--radius-md, 8px)',
                      background: 'var(--color-accent-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>{selected.display_name}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedId(null)}
                      style={{ fontSize: '0.8125rem', color: 'var(--color-ink-subtle)', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      to nie ja — zmień
                    </button>
                  </div>

                  <div>
                    <label htmlFor="employee_id" className="refined-label">
                      Twój numer pracownika
                    </label>
                    <input
                      type="text"
                      id="employee_id"
                      value={employeeId}
                      onChange={(e) => setEmployeeId(e.target.value)}
                      required
                      autoFocus
                      inputMode="numeric"
                      className="refined-input"
                      placeholder="np. z identyfikatora"
                    />
                    <p className="hint-text">Potwierdza, że to naprawdę Ty wybierasz swój wiersz.</p>
                  </div>

                  <div>
                    <label htmlFor="signature_name" className="refined-label">
                      Podpis (imię i nazwisko)
                    </label>
                    <input
                      type="text"
                      id="signature_name"
                      value={signatureName}
                      onChange={(e) => setSignatureName(e.target.value)}
                      required
                      className="refined-input"
                      placeholder="Wpisz swoje imię i nazwisko"
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                    <input
                      type="checkbox"
                      id="consent_ack"
                      className="refined-checkbox"
                      style={{ marginRight: '0.5rem', marginTop: '0.2rem' }}
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                    />
                    <label htmlFor="consent_ack" className="refined-checkbox-label" style={{ fontSize: '0.8125rem', color: 'var(--color-ink-muted)' }}>
                      Potwierdzam, że byłem/am obecny/a na tym szkoleniu.
                    </label>
                  </div>

                  {submitError && <div className="flash-message flash-error">{submitError}</div>}

                  <Button type="submit" variant="primary" disabled={!canSubmit || submitting} style={{ width: '100%', justifyContent: 'center' }}>
                    {submitting ? 'Zapisywanie…' : 'Potwierdź obecność'}
                  </Button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </AuthLayout>
  );
}
