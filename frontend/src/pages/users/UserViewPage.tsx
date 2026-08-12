import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useApiData } from '@/lib/api/useApiData';
import { usersApi } from '@/lib/api/users';
import { useEscapeAction } from '@/lib/a11y/useEscapeAction';

const ROLE_LABELS: Record<string, string> = {
  superuser: 'Superadmin',
  admin: 'Administrator',
  receptionist: 'Recepcjonistka',
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
  const { data: user, loading, error } = useApiData(() => usersApi.get(Number(id)), [id]);
  useEscapeAction(() => navigate('/users'));

  return (
    <div className="refined-page">
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
        <div className="form-card animate-fade-up" style={{ maxWidth: '40rem' }}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Imię i nazwisko" value={user.full_name} />
            <Field label="Email" value={user.email} />
            <Field label="Rola" value={ROLE_LABELS[user.role] ?? user.role} />
            <Field label="Status" value={<span className={`status-badge ${user.is_active ? 'active' : 'inactive'}`}>{user.is_active ? 'Aktywny' : 'Nieaktywny'}</span>} />
            <Field
              label="Powiązany pracownik"
              value={
                user.employee_id ? (
                  <Link to={`/employees/${user.employee_id}`} style={{ color: 'var(--color-focus-ring)' }}>
                    {user.employee_name}
                  </Link>
                ) : (
                  '—'
                )
              }
            />
            <Field label="Ostatnie logowanie" value={user.last_login ? new Date(user.last_login).toLocaleString('pl-PL') : 'nigdy'} />
            <Field label="Utworzono" value={user.created_at ? new Date(user.created_at).toLocaleString('pl-PL') : '—'} />
          </div>
        </div>
      )}
    </div>
  );
}
