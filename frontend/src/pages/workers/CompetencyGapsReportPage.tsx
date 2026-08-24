import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { SortableTh } from '@/components/ui/SortableTh';
import { Icon } from '@/lib/icons/Icon';
import { useApiData } from '@/lib/api/useApiData';
import { useTableSort } from '@/lib/useTableSort';
import { useToast } from '@/lib/feedback/ToastProvider';
import { useConfirm } from '@/lib/feedback/ConfirmProvider';
import { useAuth } from '@/lib/auth/AuthContext';
import { workersApi, type CompetencyGapRow } from '@/lib/api/workers';
import { actionPlansApi } from '@/lib/api/actionPlans';
import { ActionPlanModal, type ActionPlanSeed } from '@/components/workers/ActionPlanModal';

// Same 3-bucket severity palette as BhpExpiringReportPage/MedicalExpiringReportPage/
// AlertPanel (each keeps its own copy — see AlertPanel's comment) but bucketed
// by gap size instead of days-until-expiry: 1 level short reads very
// differently from 3+ levels short.
const GAP_BUCKET_STYLE: Record<'critical' | 'warning' | 'notice', React.CSSProperties> = {
  critical: {
    background: 'rgba(155, 44, 44, 0.08)',
    color: 'var(--color-error)',
  },
  warning: {
    background: 'var(--color-orange-bg)',
    color: 'var(--color-orange)',
  },
  notice: {
    background: 'rgba(107, 114, 128, 0.08)',
    color: 'var(--color-ink-muted)',
  },
};

// Bolder tint than GAP_BUCKET_STYLE's "notice" bucket — this marks the
// "Zaplanuj działanie" button itself as already-actioned, not a severity.
const ACTION_PLAN_BTN_STYLE: React.CSSProperties = {
  color: 'var(--color-success)',
  background: 'rgba(45, 106, 79, 0.12)',
  fontWeight: 700,
};

function gapBucket(gap: number): 'critical' | 'warning' | 'notice' {
  if (gap >= 3) return 'critical';
  if (gap === 2) return 'warning';
  return 'notice';
}

/** "Zaplanowane działanie" column text — the plan's own description, or
 * (for a "Szkolenie" plan) the linked training's title, plus its planned
 * date. Blank when the row has no plan at all. */
function formatPlannedAction(row: CompetencyGapRow): string {
  if (!row.action_plan_id) return '—';
  const label = row.action_is_training ? (row.action_training_description ?? 'Szkolenie') : (row.action_description ?? '—');
  const date = row.action_planned_date ? new Date(row.action_planned_date).toLocaleDateString('pl-PL') : null;
  return date ? `${label} — ${date}` : label;
}

function getSortValue(row: CompetencyGapRow, key: string): string | number | null {
  switch (key) {
    case 'full_name':
      return row.full_name;
    case 'job_description':
      return row.job_description;
    case 'boss_name':
      return row.boss_name;
    case 'skill_description':
      return row.skill_description;
    case 'required_rating':
      return row.required_rating;
    case 'current_rating':
      return row.current_rating;
    case 'gap':
      return row.gap;
    case 'last_update':
      return row.last_update;
    default:
      return null;
  }
}

/** LUK_1 — every active worker with at least one competency gap (required
 * job-skill level > assessed level), one row per gap-skill. Rows arrive
 * from the backend already grouped by worker (see filter_by_gap's ORDER
 * BY) — only the first row of each worker's block renders the
 * employee-level columns, so the table reads as a visual grouping without
 * needing colspan/rowspan gymnastics (in the default, unsorted order —
 * sorting flattens the grouping, see the sortKey check in isFirstOfGroup). */
export function CompetencyGapsReportPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { isModuleReadOnly } = useAuth();
  const canWrite = !isModuleReadOnly('workers');
  const { data, loading, error, reload } = useApiData(() => workersApi.skillGaps(1));
  const allRows = useMemo(() => data?.results ?? [], [data]);
  const [actionSeed, setActionSeed] = useState<ActionPlanSeed | null>(null);
  const [loadingPlanFor, setLoadingPlanFor] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  /** A gap row's action-icon click: no plan yet -> open a blank create form
   * (as before); a plan already exists -> fetch it and open the same
   * edit form ActionPlansPage uses, pre-filled — the list row only carries
   * `action_plan_id`, not the full record. */
  async function handleActionClick(row: CompetencyGapRow) {
    if (!row.action_plan_id) {
      setActionSeed({
        workerId: row.worker_id,
        workerName: row.full_name,
        skillId: row.skill_id,
        skillDescription: row.skill_description,
      });
      return;
    }
    setLoadingPlanFor(row.action_plan_id);
    try {
      const plan = await actionPlansApi.get(row.action_plan_id);
      setActionSeed({
        id: plan.id,
        workerId: plan.worker_id,
        workerName: plan.worker_name,
        skillId: plan.skill_id,
        skillDescription: plan.skill_description,
        description: plan.description,
        responsibleId: plan.responsible_id ?? '',
        plannedDate: plan.planned_date ?? '',
        status: plan.status,
        completedDate: plan.completed_date,
        effectivenessDate: plan.effectiveness_date,
        createdAt: plan.created_at,
        isTraining: plan.is_training,
        trainingDescription: plan.training_description,
        expectedIncrease: plan.expected_increase,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się wczytać planu działania.');
    } finally {
      setLoadingPlanFor(null);
    }
  }

  async function handleDeletePlan(row: CompetencyGapRow) {
    if (!row.action_plan_id) return;
    const ok = await confirm({
      title: 'Usunąć plan działania?',
      message: `Plan działania dla „${row.full_name}" (${row.skill_description}) zostanie usunięty.`,
      confirmText: 'Usuń',
      type: 'danger',
    });
    if (!ok) return;
    try {
      await actionPlansApi.remove(row.action_plan_id);
      toast.success('Plan działania usunięty.');
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się usunąć planu działania.');
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter(
      (r) =>
        r.full_name.toLowerCase().includes(q) || (r.job_description ?? '').toLowerCase().includes(q) || r.skill_description.toLowerCase().includes(q),
    );
  }, [allRows, search]);

  // Sorting flattens the backend's worker grouping — rows() only shows blank
  // worker/job/boss cells (visual grouping) in the default, unsorted order.
  const { sorted: rows, sortKey, sortOrder, onSort } = useTableSort(filtered, getSortValue);

  const workerCount = useMemo(() => new Set(allRows.map((r) => r.worker_id)).size, [allRows]);

  return (
    <div className="refined-page">
      <PageHeader
        title="Wykaz luk kompetencyjnych pracowników"
        subtitle={allRows.length > 0 ? `${workerCount} pracowników · ${allRows.length} luk kompetencyjnych` : undefined}
      />

      <div className="search-card">
        <div className="search-wrapper">
          <div className="search-input-wrap">
            <input
              type="text"
              className="refined-input"
              placeholder="Szukaj po pracowniku, stanowisku lub umiejętności…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="table-container" style={{ flex: 1 }}>
        {loading ? (
          <TableSkeleton cols={10} />
        ) : error ? (
          <EmptyState icon="error" title="Nie udało się wczytać danych" message={error} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="check_circle"
            title="Brak luk kompetencyjnych"
            message={search ? 'Żadna luka nie pasuje do wyszukiwania.' : 'Każdy pracownik spełnia wymagania kompetencyjne swojego stanowiska.'}
          />
        ) : (
          <>
            <div className="table-scroll-body">
              <table className="refined-table">
                <thead>
                  <tr>
                    <SortableTh label="Pracownik" sortKey="full_name" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <SortableTh label="Stanowisko" sortKey="job_description" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <SortableTh label="Przełożony" sortKey="boss_name" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <SortableTh label="Umiejętność" sortKey="skill_description" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <SortableTh label="Wymagany poziom" sortKey="required_rating" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <SortableTh label="Aktualny poziom" sortKey="current_rating" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <SortableTh label="Luka" sortKey="gap" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <SortableTh label="Ostatnia ocena" sortKey="last_update" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <th>Zaplanowane działanie</th>
                    <th className="text-right">Akcja</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const isFirstOfGroup = sortKey !== null || idx === 0 || rows[idx - 1].worker_id !== row.worker_id;
                    return (
                      <tr
                        key={`${row.worker_id}-${row.skill_id}`}
                        style={isFirstOfGroup && idx > 0 ? { borderTop: '2px solid var(--color-border)' } : undefined}
                      >
                        {isFirstOfGroup ? (
                          <>
                            <td
                              onClick={() => navigate(`/workers/${encodeURIComponent(row.worker_id)}`)}
                              style={{ cursor: 'pointer', fontWeight: 500 }}
                              aria-label={`Zobacz pracownika ${row.full_name}`}
                            >
                              {row.full_name}
                            </td>
                            <td>{row.job_description ?? '—'}</td>
                            <td>{row.boss_name ?? '—'}</td>
                          </>
                        ) : (
                          <>
                            <td />
                            <td />
                            <td />
                          </>
                        )}
                        <td>{row.skill_description}</td>
                        <td>{row.required_rating}</td>
                        <td>{row.current_rating ?? 'Brak oceny'}</td>
                        <td>
                          <span className="refined-badge" style={GAP_BUCKET_STYLE[gapBucket(row.gap)]}>
                            Luka: {row.gap}
                          </span>
                        </td>
                        <td>{row.last_update ? new Date(row.last_update).toLocaleDateString('pl-PL') : '—'}</td>
                        <td>{formatPlannedAction(row)}</td>
                        <td className="text-right">
                          <div className="action-icons">
                            {row.action_plan_id && canWrite && (
                              <button
                                type="button"
                                className="action-icon-btn danger-reveal"
                                title="Usuń plan działania"
                                aria-label={`Usuń plan działania — ${row.full_name}, ${row.skill_description}`}
                                onClick={() => handleDeletePlan(row)}
                              >
                                <Icon name="delete" />
                              </button>
                            )}
                            <button
                              type="button"
                              className="action-icon-btn"
                              style={row.action_plan_id ? ACTION_PLAN_BTN_STYLE : undefined}
                              title={row.action_plan_id ? 'Edytuj plan działania' : 'Zaplanuj działanie'}
                              aria-label={`${row.action_plan_id ? 'Edytuj' : 'Zaplanuj'} działanie — ${row.full_name}, ${row.skill_description}`}
                              disabled={loadingPlanFor === row.action_plan_id && loadingPlanFor !== null}
                              onClick={() => handleActionClick(row)}
                            >
                              <Icon name="checklist" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <span>
                {rows.length} {rows.length === 1 ? 'wynik' : 'wyników'}
              </span>
            </div>
          </>
        )}
      </div>

      {actionSeed && <ActionPlanModal seed={actionSeed} onClose={() => setActionSeed(null)} onSaved={reload} />}
    </div>
  );
}
