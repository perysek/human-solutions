import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useApiData } from '@/lib/api/useApiData';
import { usersApi } from '@/lib/api/users';
import { useEscapeAction } from '@/lib/a11y/useEscapeAction';
import { useToast } from '@/lib/feedback/ToastProvider';

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Administrator systemu',
  hr_manager: 'Kierownik HR',
  trainer: 'Trener',
  viewer: 'Obserwator',
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <label className="stat-label block mb-1">{label}</label>
      <p style={{ color: 'var(--color-ink)', fontSize: '0.9375rem' }}>{value}</p>
    </div>
  );
}

export function UserViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: user, loading, error, reload } = useApiData(() => usersApi.get(Number(id)), [id]);
  useEscapeAction(() => navigate('/users'));

  async function handleUnlock() {
    if (!user) return;
    try {
      await usersApi.unlock(user.id);
      toast.success('Konto odblokowane.');
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się odblokować konta.');
    }
  }

  return (
    <div className="refined-page">
      <div className="form-page-shell">
        <PageHeader
          title="Użytkownik"
          subtitle={user?.full_name}
          actions={
            <>
              <Button variant="secondary" onClick={() => navigate('/users')}>
                Wróć do listy
              </Button>
              {user && <Button variant="primary" onClick={() => navigate(`/users/${user.id}/edit`)}>Edytuj</Button>}
            </>
          }
        />

        {loading ? (
          <p className="page-subtitle">Ładowanie…</p>
        ) : error || !user ? (
          <EmptyState icon="error" title="Nie znaleziono użytkownika" message={error ?? undefined} />
        ) : (
          <div className="form-card animate-fade-up">
            <div className="form-grid">
              <Field label="Imię i nazwisko" value={user.full_name} />
              <Field label="Email" value={user.email} />
              <Field label="Rola" value={ROLE_LABELS[user.role] ?? user.role} />
              <Field label="Status" value={<span className={`status-badge ${user.is_active ? 'active' : 'inactive'}`}>{user.is_active ? 'Aktywny' : 'Nieaktywny'}</span>} />
              <Field
                label="Blokada konta"
                value={
                  user.is_locked ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span className="status-badge inactive">
                        Zablokowane {user.locked_until ? `do ${new Date(user.locked_until).toLocaleString('pl-PL')}` : ''}
                      </span>
                      <Button variant="secondary" small onClick={handleUnlock}>
                        Odblokuj
                      </Button>
                    </div>
                  ) : (
                    `Brak (${user.failed_logins} nieudanych prób od ostatniego sukcesu)`
                  )
                }
              />
              <Field label="Ostatnie logowanie" value={user.last_login ? new Date(user.last_login).toLocaleString('pl-PL') : 'nigdy'} />
              <Field label="Utworzono" value={user.created_at ? new Date(user.created_at).toLocaleString('pl-PL') : '—'} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
