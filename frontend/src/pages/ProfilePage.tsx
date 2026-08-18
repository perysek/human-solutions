import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';

const ROLE_BADGE: Record<string, string> = {
  superadmin: 'badge-purple',
  hr_manager: 'badge-blue',
  trainer: 'badge-green',
  viewer: 'badge-gray',
};

/** Faithful port of templates/auth/profile.html. */
export function ProfilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto" style={{ padding: '2rem' }}>
      <h1 className="page-title" style={{ marginBottom: '2rem' }}>
        Mój Profil
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: '1.5rem' }}>
        <div className="refined-card" style={{ padding: '1.5rem' }}>
          <h2 className="text-base font-semibold mb-5" style={{ color: 'var(--color-ink)' }}>
            Informacje o koncie
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label className="stat-label block mb-1">Imię i nazwisko</label>
              <p style={{ color: 'var(--color-ink)', fontSize: '0.9375rem' }}>{user.fullName}</p>
            </div>

            <div>
              <label className="stat-label block mb-1">Email</label>
              <p style={{ color: 'var(--color-ink)', fontSize: '0.9375rem' }}>{user.email}</p>
            </div>

            <div>
              <label className="stat-label block mb-1">Rola</label>
              <span className={`refined-badge ${ROLE_BADGE[user.role] ?? 'badge-gray'}`}>{user.role}</span>
            </div>

            <div>
              <label className="stat-label block mb-1">Status konta</label>
              <span className={`refined-badge ${user.isActive ? 'badge-green' : 'badge-red'}`}>
                {user.isActive ? 'Aktywne' : 'Nieaktywne'}
              </span>
            </div>

            {user.lastLogin && (
              <div>
                <label className="stat-label block mb-1">Ostatnie logowanie</label>
                <p style={{ color: 'var(--color-ink-muted)', fontSize: '0.8125rem' }}>
                  {new Date(user.lastLogin).toLocaleString('pl-PL')}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="refined-card" style={{ padding: '1.5rem' }}>
          <h2 className="text-base font-semibold mb-5" style={{ color: 'var(--color-ink)' }}>
            Akcje
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <button type="button" className="refined-btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled title="Poza zakresem tego boilerplate'u">
              Zmień hasło
            </button>

            <button type="button" className="refined-btn-secondary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => navigate('/')}>
              Powrót do pulpitu
            </button>

            <button type="button" className="refined-btn-danger" style={{ width: '100%', justifyContent: 'center' }} onClick={logout}>
              Wyloguj się
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
