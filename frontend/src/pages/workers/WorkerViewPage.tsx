import { useNavigate, useParams, Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useApiData } from '@/lib/api/useApiData';
import { workersApi } from '@/lib/api/workers';
import { useAuth } from '@/lib/auth/AuthContext';
import { useEscapeAction } from '@/lib/a11y/useEscapeAction';
import { useConfirm } from '@/lib/feedback/ConfirmProvider';
import { useToast } from '@/lib/feedback/ToastProvider';
import { WorkerCompetencySection } from './WorkerCompetencySection';
import { WorkerMedicalSection } from './WorkerMedicalSection';
import { WorkerBhpSection } from './WorkerBhpSection';

const GENDER_LABELS: Record<string, string> = {
  Male: 'Mężczyzna',
  Female: 'Kobieta',
  UNKNOWN: 'Nie podano',
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <label className="stat-label block mb-1">{label}</label>
      <p style={{ color: 'var(--color-ink)', fontSize: '0.9375rem' }}>{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="form-card animate-fade-up" style={{ maxWidth: '48rem' }}>
      <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--color-ink)' }}>
        {title}
      </h2>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </div>
  );
}

export function WorkerViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const { hasModuleAccess, isModuleReadOnly } = useAuth();
  const canWrite = !isModuleReadOnly('workers');
  const { data: worker, loading, error, reload } = useApiData(() => workersApi.get(id as string), [id]);
  useEscapeAction(() => navigate('/workers'));

  async function handleDeactivate() {
    if (!worker) return;
    const ok = await confirm({
      title: 'Dezaktywować pracownika?',
      message: `"${worker.full_name}" zostanie oznaczony jako nieaktywny (data zwolnienia = dziś). Dane pozostają w systemie.`,
      confirmText: 'Dezaktywuj',
      type: 'warning',
    });
    if (!ok) return;
    try {
      await workersApi.deactivate(worker.id);
      toast.success('Pracownik dezaktywowany.');
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się dezaktywować pracownika.');
    }
  }

  return (
    <div className="refined-page">
      <PageHeader
        title="Pracownik"
        subtitle={worker?.full_name}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/workers')}>
              Wróć do listy
            </Button>
            {worker && (
              <Button variant="secondary" onClick={() => navigate(`/workers/${encodeURIComponent(worker.id)}/subordinates`)}>
                Podwładni
              </Button>
            )}
            {worker?.is_active && (
              <Button variant="danger" onClick={handleDeactivate}>
                Dezaktywuj
              </Button>
            )}
            {worker && (
              <Button variant="primary" onClick={() => navigate(`/workers/${encodeURIComponent(worker.id)}/edit`)}>
                Edytuj
              </Button>
            )}
          </>
        }
      />

      {loading ? (
        <p className="page-subtitle">Ładowanie…</p>
      ) : error || !worker ? (
        <EmptyState icon="error" title="Nie znaleziono pracownika" message={error ?? undefined} />
      ) : (
        <div className="space-y-4">
          <Section title="Dane podstawowe">
            <Field label="Id" value={worker.id} />
            <Field label="Imię i nazwisko" value={worker.full_name} />
            <Field
              label="Stanowisko"
              value={
                worker.job_id ? (
                  <Link to={`/jobs/${encodeURIComponent(worker.job_id)}`} style={{ color: 'var(--color-focus-ring)' }}>
                    {worker.job_description ?? worker.job_id}
                  </Link>
                ) : (
                  '—'
                )
              }
            />
            <Field
              label="Przełożony"
              value={
                worker.boss_id ? (
                  <Link to={`/workers/${encodeURIComponent(worker.boss_id)}`} style={{ color: 'var(--color-focus-ring)' }}>
                    {worker.boss_name}
                  </Link>
                ) : (
                  '—'
                )
              }
            />
            <Field label="Płeć" value={GENDER_LABELS[worker.gender] ?? worker.gender} />
            <Field label="Status" value={<span className={`status-badge ${worker.is_active ? 'active' : 'inactive'}`}>{worker.is_active ? 'Aktywny' : 'Nieaktywny'}</span>} />
            <Field label="Data zatrudnienia" value={worker.hire_date ? new Date(worker.hire_date).toLocaleDateString('pl-PL') : '—'} />
            <Field label="Data zwolnienia" value={worker.fire_date ? new Date(worker.fire_date).toLocaleDateString('pl-PL') : '—'} />
          </Section>

          <Section title="Dane urodzenia">
            <Field label="Data urodzenia" value={worker.birth.birth_date ? new Date(worker.birth.birth_date).toLocaleDateString('pl-PL') : '—'} />
            <Field label="Miejsce urodzenia" value={worker.birth.birth_place ?? '—'} />
          </Section>

          <Section title="Obywatelstwo">
            <div className="form-field-full">
              {worker.nationalities.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {worker.nationalities.map((n) => (
                    <span key={n} className="refined-badge badge-gray">
                      {n}
                    </span>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.875rem' }}>Brak danych.</p>
              )}
            </div>
          </Section>

          <Section title="Dane cudzoziemca">
            {worker.foreigner ? (
              <>
                <Field label="Rodzaj dokumentu" value={worker.foreigner.document_kind ?? '—'} />
                <Field label="Ważność dokumentu" value={worker.foreigner.document_validity ? new Date(worker.foreigner.document_validity).toLocaleDateString('pl-PL') : '—'} />
                <Field label="Podstawa zatrudnienia" value={worker.foreigner.employment_basis ?? '—'} />
                <Field label="Ważność podstawy" value={worker.foreigner.employment_basis_validity ? new Date(worker.foreigner.employment_basis_validity).toLocaleDateString('pl-PL') : '—'} />
              </>
            ) : (
              <div className="form-field-full">
                <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.875rem' }}>Pracownik nie jest cudzoziemcem.</p>
              </div>
            )}
          </Section>

          <WorkerCompetencySection workerId={worker.id} canWrite={canWrite} />

          {hasModuleAccess('medical') && (
            <WorkerMedicalSection workerId={worker.id} canWrite={!isModuleReadOnly('medical')} />
          )}

          {hasModuleAccess('bhp') && (
            <WorkerBhpSection workerId={worker.id} canWrite={!isModuleReadOnly('bhp')} />
          )}
        </div>
      )}
    </div>
  );
}
