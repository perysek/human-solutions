import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/lib/icons/Icon';
import { useApiData } from '@/lib/api/useApiData';
import { departmentsApi } from '@/lib/api/departments';
import { jobsApi } from '@/lib/api/jobs';
import { useAuth } from '@/lib/auth/AuthContext';
import { useConfirm } from '@/lib/feedback/ConfirmProvider';
import { useToast } from '@/lib/feedback/ToastProvider';
import { useOrgChartRevisionToast } from '@/lib/orgChart/useOrgChartRevisionToast';
import { DepartmentForm } from './DepartmentForm';
import { AddJobsToDepartmentModal } from './AddJobsToDepartmentModal';

export function DepartmentEditPage() {
  const { id } = useParams<{ id: string }>();
  const departmentId = Number(id);
  const navigate = useNavigate();
  const toast = useToast();
  const orgChartToast = useOrgChartRevisionToast();
  const confirm = useConfirm();
  // "accessible for user with stanowiska access account type" — same 'jobs'
  // module grant every other Działy firmy write action piggybacks on (see
  // routes/departments/routes.py's docstring).
  const { isModuleReadOnly } = useAuth();
  const canWrite = !isModuleReadOnly('jobs');

  const { data: department, loading, error, reload: reloadDepartment } = useApiData(() => departmentsApi.get(departmentId), [departmentId]);
  const { data: jobsData, loading: jobsLoading, reload: reloadJobs } = useApiData(() => jobsApi.list(), []);
  // Same fetch feeds three things: the parent-picker's option source inside
  // DepartmentForm, the breadcrumb link above (via `department.parent_name`,
  // already on the /departments/api/<id> response — this fetch isn't what
  // resolves that string), and the "Działy podrzędne" section below.
  const { data: allDepartmentsData, reload: reloadAllDepartments } = useApiData(() => departmentsApi.list(), []);
  const [showAddJobs, setShowAddJobs] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const departmentJobs = useMemo(
    () => (jobsData?.jobs ?? []).filter((j) => j.department_id === departmentId),
    [jobsData, departmentId],
  );
  const childDepartments = useMemo(
    () => (allDepartmentsData?.departments ?? []).filter((d) => d.parent_department_id === departmentId),
    [allDepartmentsData, departmentId],
  );

  function reloadAll() {
    reloadDepartment();
    reloadJobs();
    reloadAllDepartments();
  }

  async function handleRemoveJob(jobId: string, jobLabel: string) {
    const ok = await confirm({
      title: 'Usunąć stanowisko z działu?',
      message: `Stanowisko "${jobLabel}" zostanie odłączone od tego działu — samo stanowisko, jego wymagane umiejętności i pracownicy pozostają bez zmian.`,
      confirmText: 'Usuń z działu',
      type: 'warning',
    });
    if (!ok) return;
    setRemovingId(jobId);
    try {
      const result = await departmentsApi.removeJob(departmentId, jobId);
      toast.success('Stanowisko usunięte z działu.');
      orgChartToast.notify(result.pending_change);
      reloadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się usunąć stanowiska z działu.');
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="refined-page">
      <div className="form-page-shell">
        <PageHeader
          title="Edytuj dział"
          subtitle={
            department?.parent_department_id != null && department.parent_name ? (
              <>
                <Link to={`/departments/${department.parent_department_id}/edit`} style={{ color: 'var(--color-focus-ring)' }}>
                  {department.parent_name}
                </Link>
                {' / '}
                {department.name}
              </>
            ) : (
              department?.name
            )
          }
        />
        {loading ? (
          <p className="page-subtitle">Ładowanie…</p>
        ) : error || !department ? (
          <EmptyState icon="error" title="Nie znaleziono działu" message={error ?? undefined} />
        ) : (
          <div className="space-y-4">
            <DepartmentForm
              mode="edit"
              initial={department}
              allDepartments={allDepartmentsData?.departments ?? []}
              onSaved={() => navigate('/departments')}
              onCancel={() => navigate('/departments')}
            />

            <div className="form-card animate-fade-up">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold" style={{ color: 'var(--color-ink)' }}>
                  Stanowiska w dziale
                </h2>
                {canWrite && (
                  <Button type="button" variant="secondary" small onClick={() => setShowAddJobs(true)}>
                    <Icon name="add" size={16} />
                    Dodaj stanowiska
                  </Button>
                )}
              </div>

              {jobsLoading ? (
                <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.875rem' }}>Ładowanie…</p>
              ) : departmentJobs.length === 0 ? (
                <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.875rem' }}>Brak stanowisk przypisanych do tego działu.</p>
              ) : (
                <table className="refined-table">
                  <thead>
                    <tr>
                      <th>Kod</th>
                      <th>Opis</th>
                      <th>Typ stanowiska</th>
                      {canWrite && <th className="text-right"><span className="sr-only">Akcje</span></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {departmentJobs.map((j) => (
                      <tr key={j.id}>
                        <td>{j.id}</td>
                        <td>{j.description ?? '—'}</td>
                        <td>{j.is_managerial ? 'Kierownicze' : 'Nie-kierownicze'}</td>
                        {canWrite && (
                          <td className="text-right">
                            <div className="action-icons">
                              <button
                                type="button"
                                className="action-icon-btn"
                                title="Usuń z działu"
                                aria-label={`Usuń ${j.id} z działu`}
                                disabled={removingId === j.id}
                                onClick={() => handleRemoveJob(j.id, j.description ?? j.id)}
                              >
                                <Icon name="remove" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* "Działy podrzędne" — directly parallel to "Stanowiska w
                dziale" above. Each row links into /departments/<childId>/edit,
                giving free recursive drill-down through the whole tree
                without a dedicated tree-browsing UI (this same page,
                reached again one level down). Read-only here — reparenting
                a child happens on ITS OWN edit page's parent picker, not
                from this list. */}
            <div className="form-card animate-fade-up">
              <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--color-ink)' }}>
                Działy podrzędne
              </h2>
              {childDepartments.length === 0 ? (
                <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.875rem' }}>Ten dział nie ma działów podrzędnych.</p>
              ) : (
                <table className="refined-table">
                  <thead>
                    <tr>
                      <th>Nazwa</th>
                      <th>Stanowiska</th>
                      <th>Pracownicy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {childDepartments.map((child) => (
                      <tr key={child.id} onClick={() => navigate(`/departments/${child.id}/edit`)} style={{ cursor: 'pointer' }}>
                        <td>{child.name}</td>
                        <td>{child.job_count}</td>
                        <td>{child.worker_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      {showAddJobs && department && (
        <AddJobsToDepartmentModal
          departmentId={department.id}
          departmentName={department.name}
          onClose={() => setShowAddJobs(false)}
          onAdded={reloadAll}
        />
      )}
    </div>
  );
}
