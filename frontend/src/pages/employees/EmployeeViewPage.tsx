import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useApiData } from '@/lib/api/useApiData';
import { employeesApi, EMPLOYMENT_STATUS_LABELS } from '@/lib/api/employees';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <label className="stat-label block mb-1">{label}</label>
      <p style={{ color: 'var(--color-ink)', fontSize: '0.9375rem' }}>{value}</p>
    </div>
  );
}

export function EmployeeViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: employee, loading, error } = useApiData(() => employeesApi.get(Number(id)), [id]);

  return (
    <div className="refined-page">
      <PageHeader
        title="Pracownik"
        subtitle={employee?.full_name}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/employees')}>
              Wróć do listy
            </Button>
            {employee && (
              <Button variant="primary" onClick={() => navigate(`/employees/${employee.id}/edit`)}>
                Edytuj
              </Button>
            )}
          </>
        }
      />

      {loading ? (
        <p className="page-subtitle">Ładowanie…</p>
      ) : error || !employee ? (
        <EmptyState icon="error" title="Nie znaleziono pracownika" message={error ?? undefined} />
      ) : (
        <div className="form-card animate-fade-up" style={{ maxWidth: '40rem' }}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Imię i nazwisko" value={employee.full_name} />
            <Field label="Stanowisko" value={employee.position ?? '—'} />
            <Field label="Status zatrudnienia" value={EMPLOYMENT_STATUS_LABELS[employee.employment_status] ?? employee.employment_status} />
            <Field label="Aktywny" value={employee.is_active ? 'Tak' : 'Nie'} />
            <Field label="Telefon" value={employee.phone ?? '—'} />
            <Field label="Email" value={employee.email ?? '—'} />
            <Field label="Data zatrudnienia" value={employee.hire_date ?? '—'} />
            <Field label="Data zwolnienia" value={employee.termination_date ?? '—'} />
            <Field label="Wynagrodzenie podstawowe" value={employee.base_salary != null ? `${employee.base_salary} zł` : '—'} />
            <Field label="Prowizja" value={employee.commission_rate != null ? `${employee.commission_rate}%` : '—'} />
            {employee.notes && <Field label="Notatki" value={employee.notes} />}
          </div>
        </div>
      )}
    </div>
  );
}
