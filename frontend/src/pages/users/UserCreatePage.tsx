import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { UserForm } from './UserForm';

export function UserCreatePage() {
  const navigate = useNavigate();
  return (
    <div className="refined-page">
      <div className="form-page-shell">
        <PageHeader title="Nowy użytkownik" subtitle="Utwórz konto logowania" />
        <UserForm mode="create" onSaved={(id) => navigate(`/users/${id}`)} onCancel={() => navigate('/users')} />
      </div>
    </div>
  );
}
