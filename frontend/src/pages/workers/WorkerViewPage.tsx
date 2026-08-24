import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useApiData } from '@/lib/api/useApiData';
import { workersApi } from '@/lib/api/workers';
import { useAuth } from '@/lib/auth/AuthContext';
import { useEscapeAction } from '@/lib/a11y/useEscapeAction';
import { TerminationModal } from '@/components/workers/TerminationModal';
import { WorkerAttentionSection } from './WorkerAttentionSection';
import { WorkerCompetencySection } from './WorkerCompetencySection';
import { WorkerMedicalSection } from './WorkerMedicalSection';
import { WorkerBhpSection } from './WorkerBhpSection';
import { WorkerTrainingHistorySection } from './WorkerTrainingHistorySection';

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
    <div className="form-card animate-fade-up">
      <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--color-ink)' }}>
        {title}
      </h2>
      <div className="form-grid">{children}</div>
    </div>
  );
}

export function WorkerViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasModuleAccess, isModuleReadOnly } = useAuth();
  const canWrite = !isModuleReadOnly('workers');
  const { data: worker, loading, error, reload } = useApiData(() => workersApi.get(id as string), [id]);
  useEscapeAction(() => navigate('/workers'));

  const [showTerminationModal, setShowTerminationModal] = useState(false);

  return (
    <div className="refined-page">
      <div className="form-page-shell">
        <PageHeader
          title="Pracownik"
          subtitle={worker?.full_name}
          subtitleViewTransitionName={worker ? `worker-name-${worker.id}` : undefined}
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
              {worker && (
                <Button variant="secondary" onClick={() => navigate(`/workers/${encodeURIComponent(worker.id)}/onboarding-trainings`)}>
                  Szkolenia wstępne
                </Button>
              )}
              {worker?.is_active && !worker.pending_termination && (
                <Button variant="danger" onClick={() => setShowTerminationModal(true)}>
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
              {worker.job_is_managerial && worker.department_name && (
                <Field label="Kierownik działu" value={`kierownik działu ${worker.department_name}`} />
              )}
              <Field label="Przełożony" value={worker.boss_name ?? '—'} />
              <Field label="Płeć" value={GENDER_LABELS[worker.gender] ?? worker.gender} />
              <Field label="Status" value={<StatusBadge status={worker.is_active ? 'active' : 'inactive'}>{worker.is_active ? 'Aktywny' : 'Nieaktywny'}</StatusBadge>} />
              <Field label="Data zatrudnienia" value={worker.hire_date ? new Date(worker.hire_date).toLocaleDateString('pl-PL') : '—'} />
              <Field label="Data zwolnienia" value={worker.fire_date ? new Date(worker.fire_date).toLocaleDateString('pl-PL') : '—'} />
            </Section>

            {worker.pending_termination && (
              <div className="form-card animate-fade-up" style={{ borderColor: 'var(--color-warning)' }}>
                <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--color-ink)' }}>
                  Wypowiedzenie złożone
                </h2>
                <div className="form-grid">
                  <Field label="Data złożenia" value={new Date(worker.pending_termination.submission_date).toLocaleDateString('pl-PL')} />
                  <Field label="Okres wypowiedzenia" value={`${worker.pending_termination.notice_period_days} dni`} />
                  <Field label="Planowana data zwolnienia" value={new Date(worker.pending_termination.planned_fire_date).toLocaleDateString('pl-PL')} />
                  <Field label="Przyczyna złożenia" value={worker.pending_termination.reason} />
                  {worker.pending_termination.shortening_reason && (
                    <Field label="Przyczyna skrócenia okresu" value={worker.pending_termination.shortening_reason} />
                  )}
                </div>
              </div>
            )}

            <WorkerAttentionSection
              workerId={worker.id}
              workerName={worker.full_name}
              canSeeMedical={hasModuleAccess('medical')}
              canSeeBhp={hasModuleAccess('bhp')}
            />

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

            <WorkerTrainingHistorySection workerId={worker.id} />
          </div>
        )}
      </div>
      {showTerminationModal && worker && (
        <TerminationModal
          workerId={worker.id}
          workerName={worker.full_name}
          onClose={() => setShowTerminationModal(false)}
          onSubmitted={reload}
        />
      )}
    </div>
  );
}
