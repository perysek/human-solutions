import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { useApiData } from '@/lib/api/useApiData';
import { usersApi } from '@/lib/api/users';
import { UserForm } from './UserForm';

export function UserEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: user, loading, error } = useApiData(() => usersApi.get(Number(id)), [id]);

  return (
    <div className="refined-page">
      <div className="form-page-shell">
        <PageHeader title="Edytuj użytkownika" subtitle={user?.full_name} />
        {loading ? (
          <p className="page-subtitle">Ładowanie…</p>
        ) : error || !user ? (
          <EmptyState icon="error" title="Nie znaleziono użytkownika" message={error ?? undefined} />
        ) : (
          <UserForm mode="edit" initial={user} onSaved={(savedId) => navigate(`/users/${savedId}`)} onCancel={() => navigate('/users')} />
        )}
      </div>
    </div>
  );
}
