import { Fragment, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { PaginatedTable } from '@/components/ui/PaginatedTable';
import { SortableTh } from '@/components/ui/SortableTh';
import { Icon } from '@/lib/icons/Icon';
import { useApiData } from '@/lib/api/useApiData';
import { useTableSort } from '@/lib/useTableSort';
import { useToast } from '@/lib/feedback/ToastProvider';
import { useConfirm } from '@/lib/feedback/ConfirmProvider';
import { useAuth } from '@/lib/auth/AuthContext';
import { useEscapeAction } from '@/lib/a11y/useEscapeAction';
import { actionPlansApi, type ActionPlan, type ActionPlanHistoryEvent } from '@/lib/api/actionPlans';
import { ACTION_PLAN_STATUS_OPTIONS } from '@/lib/actionPlanStatus';
import { ActionPlanModal, type ActionPlanSeed } from '@/components/workers/ActionPlanModal';

const STATUS_FILTER_OPTIONS = ACTION_PLAN_STATUS_OPTIONS.map((o) => ({
  value: o.value,
  label: o.label,
}));

function getSortValue(row: ActionPlan, key: string): string | number | null {
  switch (key) {
    case 'worker_name':
      return row.worker_name;
    case 'skill_description':
      return row.skill_description;
    case 'description':
      return row.description;
    case 'responsible_name':
      return row.responsible_name;
    case 'planned_date':
      return row.planned_date;
    case 'completed_date':
      return row.completed_date;
    case 'effectiveness_date':
      return row.effectiveness_date;
    case 'status':
      return row.status;
    default:
      return null;
  }
}

const FIELD_LABELS: Record<string, string> = {
  description: 'Opis działania',
  responsible_id: 'Odpowiedzialny',
  planned_date: 'Planowana data',
  status: 'Status',
  completed_date: 'Data zakończenia',
  effectiveness_date: 'Data oceny skuteczności',
  skill_increase_applied: 'Wzrost oceny zastosowany',
};

const DATE_FIELDS = new Set(['planned_date', 'completed_date', 'effectiveness_date']);

function statusBadge(status: string) {
  const opt = ACTION_PLAN_STATUS_OPTIONS.find((o) => o.value === status);
  if (!opt) return status;
  return (
    <span className="refined-badge" style={{ background: opt.background, color: opt.color }}>
      {opt.label}
    </span>
  );
}

function formatHistoryValue(fieldName: string | null, value: string | null): string {
  if (value === null || value === '') return '—';
  if (fieldName === 'status') return ACTION_PLAN_STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value;
  if (fieldName === 'skill_increase_applied') return value === 'True' ? 'Tak' : 'Nie';
  if (fieldName && DATE_FIELDS.has(fieldName) && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(value).toLocaleDateString('pl-PL');
  }
  return value;
}

function seedFromPlan(plan: ActionPlan): ActionPlanSeed {
  return {
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
  };
}

/** LUK_2 — tracking/update view for every action plan raised from the
 * competency-gap report (LUK_1). Creation stays on CompetencyGapsReportPage
 * (a plan always originates from a specific gap row); this page is for
 * following up: editing status/dates, and inspecting the full per-field
 * audit trail (routes/workers/routes.py's api_action_plan_history) — the
 * explicit "keep full history" requirement this table was built under. */
export function ActionPlansPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { isModuleReadOnly } = useAuth();
  const canWrite = !isModuleReadOnly('workers');

  // task2 (pulpit's "Działania do luk kompetencji" alert) — DashboardPage
  // navigates here with `returnTo: '/'` (same location.state pattern as
  // JobEditPage's focusDepartment/returnTo). Escape only does anything when
  // that state is present, so navigating here directly (sidebar link) keeps
  // its normal no-op Escape — this page has no "back" target of its own.
  const location = useLocation();
  const { returnTo } = (location.state as { returnTo?: string } | null) ?? {};
  useEscapeAction(() => navigate(returnTo!), !!returnTo);

  const { data, loading, error, reload } = useApiData(() => actionPlansApi.list());
  const rows = useMemo(() => data?.results ?? [], [data]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set(STATUS_FILTER_OPTIONS.map((o) => o.value)));
  const [editSeed, setEditSeed] = useState<ActionPlanSeed | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [historyById, setHistoryById] = useState<Record<number, ActionPlanHistoryEvent[]>>({});
  const [historyLoading, setHistoryLoading] = useState(false);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!statusFilter.has(r.status)) return false;
      if (!term) return true;
      return (
        r.worker_name.toLowerCase().includes(term) ||
        r.skill_description.toLowerCase().includes(term) ||
        r.description.toLowerCase().includes(term) ||
        (r.responsible_name ?? '').toLowerCase().includes(term)
      );
    });
  }, [rows, search, statusFilter]);

  const { sorted, sortKey, sortOrder, onSort } = useTableSort(filteredRows, getSortValue);

  async function loadHistory(planId: number) {
    setHistoryLoading(true);
    try {
      const result = await actionPlansApi.history(planId);
      setHistoryById((cur) => ({ ...cur, [planId]: result.events }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się wczytać historii.');
    } finally {
      setHistoryLoading(false);
    }
  }

  function toggleHistory(plan: ActionPlan) {
    if (expandedId === plan.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(plan.id);
    if (!historyById[plan.id]) loadHistory(plan.id);
  }

  function handleSaved(planId: number) {
    reload();
    // If this plan's history is currently open, refetch it immediately
    // rather than just dropping the cache — an invalidated-but-not-refetched
    // entry would render as "no history" until the user collapses and
    // re-expands the row, which reads as data loss right after a save.
    if (expandedId === planId) loadHistory(planId);
    else
      setHistoryById((cur) => {
        if (!(planId in cur)) return cur;
        const next = { ...cur };
        delete next[planId];
        return next;
      });
  }

  async function handleDelete(e: React.MouseEvent, plan: ActionPlan) {
    e.stopPropagation();
    const ok = await confirm({
      title: 'Usunąć plan działania?',
      message: `Plan działania "${plan.description}" (${plan.worker_name}) zostanie usunięty.`,
      confirmText: 'Usuń',
      type: 'danger',
    });
    if (!ok) return;
    try {
      await actionPlansApi.remove(plan.id);
      toast.success('Plan działania usunięty.');
      if (expandedId === plan.id) setExpandedId(null);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się usunąć planu działania.');
    }
  }

  return (
    <div className="refined-page">
      <PageHeader title="Plany działań" subtitle={rows.length > 0 ? `${rows.length} planów działań` : undefined} />

      <div className="search-card">
        <div className="search-wrapper">
          <div className="search-input-wrap">
            <input
              type="text"
              className="refined-input"
              placeholder="Szukaj po pracowniku, umiejętności, opisie lub odpowiedzialnym…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="table-container" style={{ flex: 1 }}>
        {loading ? (
          <TableSkeleton cols={8} />
        ) : error ? (
          <EmptyState icon="error" title="Nie udało się wczytać danych" message={error} />
        ) : rows.length === 0 ? (
          <EmptyState icon="checklist" title="Brak planów działań" message="Plany działań tworzy się z poziomu wykazu luk kompetencyjnych." />
        ) : sorted.length === 0 ? (
          <EmptyState icon="search" title="Brak wyników" message="Żaden plan działania nie pasuje do filtrów." />
        ) : (
          <PaginatedTable rows={sorted} pageSize={25}>
            {(pageRows) => (
              <table className="refined-table">
                <thead>
                  <tr>
                    <SortableTh label="Pracownik" sortKey="worker_name" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <SortableTh label="Umiejętność" sortKey="skill_description" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <SortableTh label="Opis działania" sortKey="description" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <SortableTh label="Odpowiedzialny" sortKey="responsible_name" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <SortableTh label="Planowana data" sortKey="planned_date" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <SortableTh label="Data zakończenia" sortKey="completed_date" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <SortableTh
                      label="Data oceny skuteczności"
                      sortKey="effectiveness_date"
                      currentSort={sortKey}
                      currentOrder={sortOrder}
                      onSort={onSort}
                    />
                    <SortableTh
                      label="Status"
                      sortKey="status"
                      currentSort={sortKey}
                      currentOrder={sortOrder}
                      onSort={onSort}
                      filter={{
                        options: STATUS_FILTER_OPTIONS,
                        selected: statusFilter,
                        onChange: setStatusFilter,
                      }}
                    />
                    <th className="text-right"><span className="sr-only">Akcje</span></th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((plan) => (
                    <Fragment key={plan.id}>
                      <tr>
                        <td
                          onClick={() => navigate(`/workers/${encodeURIComponent(plan.worker_id)}`)}
                          style={{ cursor: 'pointer', fontWeight: 500 }}
                          aria-label={`Zobacz pracownika ${plan.worker_name}`}
                        >
                          {plan.worker_name}
                        </td>
                        <td>{plan.skill_description}</td>
                        <td style={{ maxWidth: '18rem' }}>{plan.description}</td>
                        <td>{plan.responsible_name ?? '—'}</td>
                        <td>{plan.planned_date ? new Date(plan.planned_date).toLocaleDateString('pl-PL') : '—'}</td>
                        <td>{plan.completed_date ? new Date(plan.completed_date).toLocaleDateString('pl-PL') : '—'}</td>
                        <td>{plan.effectiveness_date ? new Date(plan.effectiveness_date).toLocaleDateString('pl-PL') : '—'}</td>
                        <td>{statusBadge(plan.status)}</td>
                        <td className="text-right">
                          <div className="action-icons">
                            <button
                              type="button"
                              className="action-icon-btn"
                              title="Historia zmian"
                              aria-label={`Historia zmian — ${plan.worker_name}, ${plan.skill_description}`}
                              aria-expanded={expandedId === plan.id}
                              onClick={() => toggleHistory(plan)}
                            >
                              <Icon name="history" />
                            </button>
                            {canWrite && (
                              <button
                                type="button"
                                className="action-icon-btn"
                                title="Edytuj"
                                aria-label={`Edytuj plan działania — ${plan.worker_name}, ${plan.skill_description}`}
                                onClick={() => setEditSeed(seedFromPlan(plan))}
                              >
                                <Icon name="edit" />
                              </button>
                            )}
                            {canWrite && (
                              <button
                                type="button"
                                className="action-icon-btn danger-reveal"
                                title="Usuń"
                                aria-label={`Usuń plan działania — ${plan.worker_name}, ${plan.skill_description}`}
                                onClick={(e) => handleDelete(e, plan)}
                              >
                                <Icon name="delete" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandedId === plan.id && (
                        <tr>
                          <td colSpan={9} style={{ background: 'var(--color-surface)' }}>
                            <div style={{ padding: '0.75rem 0' }}>
                              {historyLoading && !historyById[plan.id] ? (
                                <p
                                  style={{
                                    color: 'var(--color-ink-subtle)',
                                    fontSize: '0.8125rem',
                                  }}
                                >
                                  Ładowanie historii…
                                </p>
                              ) : (historyById[plan.id]?.length ?? 0) === 0 ? (
                                <p
                                  style={{
                                    color: 'var(--color-ink-subtle)',
                                    fontSize: '0.8125rem',
                                  }}
                                >
                                  Brak historii zmian.
                                </p>
                              ) : (
                                <ul className="space-y-1.5">
                                  {historyById[plan.id].map((ev) => (
                                    <li
                                      key={ev.id}
                                      style={{
                                        fontSize: '0.8125rem',
                                        color: 'var(--color-ink)',
                                      }}
                                    >
                                      <span
                                        style={{
                                          color: 'var(--color-ink-subtle)',
                                        }}
                                      >
                                        {ev.timestamp ? new Date(ev.timestamp).toLocaleString('pl-PL') : ''} — {ev.user_name ?? 'System'}:
                                      </span>{' '}
                                      {ev.field_name ? (
                                        <>
                                          <strong>{FIELD_LABELS[ev.field_name] ?? ev.field_name}</strong>{' '}
                                          {formatHistoryValue(ev.field_name, ev.old_value)} → {formatHistoryValue(ev.field_name, ev.new_value)}
                                        </>
                                      ) : (
                                        <strong>Utworzono plan działania</strong>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </PaginatedTable>
        )}
      </div>

      {editSeed && (
        <ActionPlanModal
          seed={editSeed}
          onClose={() => setEditSeed(null)}
          onSaved={() => {
            if (editSeed.id != null) handleSaved(editSeed.id);
          }}
        />
      )}
    </div>
  );
}
