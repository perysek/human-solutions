import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { Icon } from '@/lib/icons/Icon';
import { useApiData } from '@/lib/api/useApiData';
import { workersApi } from '@/lib/api/workers';
import { trainingsApi, type TrainingListItem } from '@/lib/api/trainings';
import { useEscapeAction } from '@/lib/a11y/useEscapeAction';
import { useToast } from '@/lib/feedback/ToastProvider';
import { useAuth } from '@/lib/auth/AuthContext';
import { ACTION_PLAN_STATUS_OPTIONS } from '@/lib/actionPlanStatus';

const WORKER_STATUS_BY_VALUE = new Map(ACTION_PLAN_STATUS_OPTIONS.map((o) => [o.value, o]));

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleDateString('pl-PL') : '—';
}

/** Local (not UTC) today as 'YYYY-MM-DD' — matches an `<input type="date">`'s
 * own value format, so it can be compared/assigned directly. */
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "Szkolenia wstępne" — bulk-schedule a worker's onboarding curriculum
 * (the trainings linked to their job position, `training_job`) from one
 * picker table. Reuses TrainingsListPage's own column set/table styling
 * plus a leading checkbox column; a training the worker is already actively
 * enrolled in shows its own status and can't be re-selected (the backend
 * would just skip it — disabling here is purely to avoid a confusing
 * no-op click). Deliberately not paginated: a job's onboarding curriculum
 * is a bounded set (training_job), unlike the full catalog TrainingsListPage
 * renders. */
export function WorkerOnboardingTrainingsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { hasRole } = useAuth();
  useEscapeAction(() => navigate(`/workers/${encodeURIComponent(id as string)}`));

  const { data: worker, loading: workerLoading, error: workerError } = useApiData(() => workersApi.get(id as string), [id]);

  const {
    data: trainingsData,
    loading: trainingsLoading,
    error: trainingsError,
    reload: reloadTrainings,
  } = useApiData(
    () =>
      worker?.job_id
        ? trainingsApi.list({ job_id: worker.job_id, worker_id: worker.id, page_size: 200, sort: 'description', order: 'asc' })
        : Promise.resolve({ trainings: [], count: 0, page: 1, page_size: 200 }),
    [worker?.job_id, worker?.id],
  );
  // Curriculum order: mandatory/ordered trainings first (by sequence_order),
  // then unordered ones — same rank the DB's partial unique index enforces
  // per job (see migration n3o4p5q6r7s8), just applied client-side since the
  // API's own sort param is a plain column whitelist (description/date/
  // completion), not this composite. Ties fall back to the picker's own
  // default order (description) via a stable sort.
  const trainings = useMemo(() => {
    const rows = trainingsData?.trainings ?? [];
    return [...rows].sort((a, b) => {
      const aOrder = a.job_sequence_order ?? Infinity;
      const bOrder = b.job_sequence_order ?? Infinity;
      return aOrder - bOrder;
    });
  }, [trainingsData]);
  const eligibleIds = useMemo(() => trainings.filter((t) => !t.worker_status).map((t) => t.id), [trainings]);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [startDate, setStartDate] = useState('');
  const [scheduling, setScheduling] = useState(false);

  function toggleOne(trainingId: number) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(trainingId)) next.delete(trainingId);
      else next.add(trainingId);
      return next;
    });
  }

  const allEligibleSelected = eligibleIds.length > 0 && eligibleIds.every((tid) => selected.has(tid));

  function toggleAll() {
    setSelected(allEligibleSelected ? new Set() : new Set(eligibleIds));
  }

  const canSchedule = selected.size > 0 && startDate.length > 0 && startDate >= todayStr() && !scheduling;

  async function handleSchedule() {
    if (!canSchedule || !worker) return;
    // Preserve the table's own row order among the checked ids — "first
    // selected" reads as "first in the list that's checked", not
    // click-chronology, and that order drives the +7-day stepping.
    const orderedIds = trainings.filter((t) => selected.has(t.id)).map((t) => t.id);
    setScheduling(true);
    try {
      const result = await workersApi.scheduleOnboardingTrainings(worker.id, { training_ids: orderedIds, start_date: startDate });
      if (result.scheduled_count === 0) {
        toast.warning('Wszystkie wybrane szkolenia są już zaplanowane dla tego pracownika.');
      } else {
        toast.success(`Szkolenia zaplanowane w okresie ${fmt(result.start_date)} - ${fmt(result.end_date)}`);
        if (result.skipped_count > 0) {
          toast.info(`Pominięto ${result.skipped_count} już zaplanowanych szkoleń.`);
        }
      }
      setSelected(new Set());
      setStartDate('');
      reloadTrainings();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się zaplanować szkoleń.');
    } finally {
      setScheduling(false);
    }
  }

  const loading = workerLoading || trainingsLoading;

  return (
    <div className="refined-page">
      <PageHeader
        title="Szkolenia wstępne"
        subtitle={worker?.full_name}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate(`/workers/${encodeURIComponent(id as string)}`)}>
              Wróć
            </Button>
            {/* POST /trainings/api is role_required('superadmin', 'hr_manager')
                only (see router.tsx's /trainings/create guard) — hidden for
                trainer/viewer rather than shown-then-bounced. Requires
                worker.job_id (checked below too, via the !worker.job_id
                EmptyState) since the whole point of this button is to link
                the new training into THIS job's curriculum. */}
            {worker && worker.job_id && hasRole('superadmin', 'hr_manager') && (
              <Button
                variant="primary"
                onClick={() =>
                  navigate('/trainings/create', {
                    state: {
                      returnTo: `/workers/${encodeURIComponent(worker.id)}/onboarding-trainings`,
                      prefillWorkerId: worker.id,
                      prefillWorkerName: worker.full_name,
                      prefillJobId: worker.job_id,
                    },
                  })
                }
              >
                <Icon name="add" size={16} />
                Utwórz szkolenie
              </Button>
            )}
          </>
        }
      />

      {workerLoading ? (
        <p className="page-subtitle">Ładowanie…</p>
      ) : workerError || !worker ? (
        <EmptyState icon="error" title="Nie znaleziono pracownika" message={workerError ?? undefined} />
      ) : !worker.job_id ? (
        <EmptyState
          icon="badge"
          title="Brak stanowiska"
          message="Pracownik nie ma przypisanego stanowiska — brak zdefiniowanego programu szkoleń wstępnych."
        />
      ) : (
        <>
          {selected.size > 0 && (
            <div className="search-card">
              <div className="search-wrapper flex items-end gap-3">
                <div className="form-field">
                  <label className="form-label" htmlFor="onboarding-start-date">
                    Podaj datę rozpoczęcia
                  </label>
                  <input
                    id="onboarding-start-date"
                    type="date"
                    className="form-input"
                    value={startDate}
                    min={todayStr()}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <Button variant="primary" onClick={handleSchedule} disabled={!canSchedule}>
                  {scheduling ? 'Planowanie…' : 'Zaplanuj'}
                </Button>
                <span style={{ color: 'var(--color-ink-subtle)', fontSize: '0.8125rem' }}>
                  Wybrano {selected.size} {selected.size === 1 ? 'szkolenie' : 'szkoleń'}
                </span>
              </div>
            </div>
          )}

          <div className="table-container" style={{ flex: 1 }}>
            {loading ? (
              <TableSkeleton cols={8} />
            ) : trainingsError ? (
              <EmptyState icon="error" title="Nie udało się wczytać danych" message={trainingsError} />
            ) : trainings.length === 0 ? (
              <EmptyState
                icon="badge"
                title="Brak szkoleń wstępnych"
                message="Do stanowiska pracownika nie przypisano żadnych szkoleń."
              />
            ) : (
              <div className="table-scroll-body">
                <table className="refined-table">
                  <thead>
                    <tr>
                      <th style={{ width: '2.5rem' }}>
                        <input
                          type="checkbox"
                          aria-label="Zaznacz wszystkie"
                          style={{ accentColor: 'var(--color-accent)' }}
                          checked={allEligibleSelected}
                          disabled={eligibleIds.length === 0}
                          onChange={toggleAll}
                        />
                      </th>
                      <th style={{ width: '3.5rem' }} title="Kolejność ukończenia w programie wstępnym stanowiska">
                        Kol.
                      </th>
                      <th>Nazwa</th>
                      <th>Prowadzący</th>
                      <th>Data</th>
                      <th>Uczestników</th>
                      <th>Ukończenie</th>
                      <th>Status pracownika</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trainings.map((t: TrainingListItem, i) => {
                      const enrolled = Boolean(t.worker_status);
                      const status = t.worker_status ? WORKER_STATUS_BY_VALUE.get(t.worker_status) : null;
                      return (
                        <tr key={t.id} style={{ animationDelay: `${Math.min(i, 7) * 30}ms` }}>
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`Zaznacz ${t.description}`}
                              style={{ accentColor: 'var(--color-accent)' }}
                              checked={selected.has(t.id)}
                              disabled={enrolled}
                              onChange={() => toggleOne(t.id)}
                            />
                          </td>
                          <td>{t.job_sequence_order ?? '—'}</td>
                          <td>
                            {t.description}
                            {t.job_is_mandatory && (
                              <span
                                className="refined-badge badge-red"
                                title="Obowiązkowe szkolenie wstępne dla tego stanowiska"
                                style={{ marginLeft: '0.5rem' }}
                              >
                                Obowiązkowe
                              </span>
                            )}
                          </td>
                          <td>{t.trainer_names ?? '—'}</td>
                          <td>{fmt(t.training_date)}</td>
                          <td>{t.participant_count}</td>
                          <td>{t.completion !== null ? `${t.completion}%` : '—'}</td>
                          <td>
                            {status ? (
                              <span className="refined-badge" style={{ color: status.color, background: status.background }}>
                                {status.label}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
