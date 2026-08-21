import { Fragment, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { PaginatedTable } from '@/components/ui/PaginatedTable';
import { ColumnFilterDropdown } from '@/components/ui/ColumnFilterDropdown';
import { Icon } from '@/lib/icons/Icon';
import { useApiData } from '@/lib/api/useApiData';
import { useToast } from '@/lib/feedback/ToastProvider';
import { useAuth } from '@/lib/auth/AuthContext';
import { actionPlansApi, type ActionPlan, type ActionPlanHistoryEvent } from '@/lib/api/actionPlans';
import { ACTION_PLAN_STATUS_OPTIONS } from '@/lib/actionPlanStatus';
import { ActionPlanModal, type ActionPlanSeed } from '@/components/workers/ActionPlanModal';

const STATUS_FILTER_OPTIONS = ACTION_PLAN_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }));

const FIELD_LABELS: Record<string, string> = {
  description: 'Opis działania',
  responsible_id: 'Odpowiedzialny',
  planned_date: 'Planowana data',
  status: 'Status',
  completed_date: 'Data zakończenia',
  effectiveness_date: 'Data oceny skuteczności',
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
  const { isModuleReadOnly } = useAuth();
  const canWrite = !isModuleReadOnly('workers');

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
        ) : filteredRows.length === 0 ? (
          <EmptyState icon="search" title="Brak wyników" message="Żaden plan działania nie pasuje do filtrów." />
        ) : (
          <PaginatedTable rows={filteredRows} pageSize={25}>
            {(pageRows) => (
              <table className="refined-table">
                <thead>
                  <tr>
                    <th>Pracownik</th>
                    <th>Umiejętność</th>
                    <th>Opis działania</th>
                    <th>Odpowiedzialny</th>
                    <th>Planowana data</th>
                    <th>Data zakończenia</th>
                    <th>Data oceny skuteczności</th>
                    <th>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
                        Status
                        <ColumnFilterDropdown columnLabel="Status" options={STATUS_FILTER_OPTIONS} selected={statusFilter} onChange={setStatusFilter} />
                      </span>
                    </th>
                    <th className="text-right">Akcje</th>
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
                          </div>
                        </td>
                      </tr>
                      {expandedId === plan.id && (
                        <tr>
                          <td colSpan={9} style={{ background: 'var(--color-surface)' }}>
                            <div style={{ padding: '0.75rem 0' }}>
                              {historyLoading && !historyById[plan.id] ? (
                                <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.8125rem' }}>Ładowanie historii…</p>
                              ) : (historyById[plan.id]?.length ?? 0) === 0 ? (
                                <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.8125rem' }}>Brak historii zmian.</p>
                              ) : (
                                <ul className="space-y-1.5">
                                  {historyById[plan.id].map((ev) => (
                                    <li key={ev.id} style={{ fontSize: '0.8125rem', color: 'var(--color-ink)' }}>
                                      <span style={{ color: 'var(--color-ink-subtle)' }}>
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
