import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { Icon } from '@/lib/icons/Icon';
import { useApiData } from '@/lib/api/useApiData';
import { workersApi } from '@/lib/api/workers';
import { ActionPlanModal, type ActionPlanContext } from '@/components/workers/ActionPlanModal';

// Same 3-bucket severity palette as BhpExpiringReportPage/MedicalExpiringReportPage/
// AlertPanel (each keeps its own copy — see AlertPanel's comment) but bucketed
// by gap size instead of days-until-expiry: 1 level short reads very
// differently from 3+ levels short.
const GAP_BUCKET_STYLE: Record<'critical' | 'warning' | 'notice', React.CSSProperties> = {
  critical: { background: 'rgba(155, 44, 44, 0.08)', color: 'var(--color-error)' },
  warning: { background: 'var(--color-orange-bg)', color: 'var(--color-orange)' },
  notice: { background: 'rgba(107, 114, 128, 0.08)', color: 'var(--color-ink-muted)' },
};

function gapBucket(gap: number): 'critical' | 'warning' | 'notice' {
  if (gap >= 3) return 'critical';
  if (gap === 2) return 'warning';
  return 'notice';
}

/** LUK_1 — every active worker with at least one competency gap (required
 * job-skill level > assessed level), one row per gap-skill. Rows arrive
 * from the backend already grouped by worker (see filter_by_gap's ORDER
 * BY) — only the first row of each worker's block renders the
 * employee-level columns, so the table reads as a visual grouping without
 * needing colspan/rowspan gymnastics. */
export function CompetencyGapsReportPage() {
  const navigate = useNavigate();
  const { data, loading, error } = useApiData(() => workersApi.skillGaps(1));
  const rows = useMemo(() => data?.results ?? [], [data]);
  const [actionContext, setActionContext] = useState<ActionPlanContext | null>(null);

  const workerCount = useMemo(() => new Set(rows.map((r) => r.worker_id)).size, [rows]);

  return (
    <div className="refined-page">
      <PageHeader
        title="Wykaz luk kompetencyjnych pracowników"
        subtitle={rows.length > 0 ? `${workerCount} pracowników · ${rows.length} luk kompetencyjnych` : undefined}
      />

      <div className="table-container" style={{ flex: 1 }}>
        {loading ? (
          <TableSkeleton cols={9} />
        ) : error ? (
          <EmptyState icon="error" title="Nie udało się wczytać danych" message={error} />
        ) : rows.length === 0 ? (
          <EmptyState icon="check_circle" title="Brak luk kompetencyjnych" message="Każdy pracownik spełnia wymagania kompetencyjne swojego stanowiska." />
        ) : (
          <table className="refined-table">
            <thead>
              <tr>
                <th>Pracownik</th>
                <th>Stanowisko</th>
                <th>Przełożony</th>
                <th>Umiejętność</th>
                <th>Wymagany poziom</th>
                <th>Aktualny poziom</th>
                <th>Luka</th>
                <th>Ostatnia ocena</th>
                <th className="text-right">Akcja</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const isFirstOfGroup = idx === 0 || rows[idx - 1].worker_id !== row.worker_id;
                return (
                  <tr key={`${row.worker_id}-${row.skill_id}`} style={isFirstOfGroup && idx > 0 ? { borderTop: '2px solid var(--color-border)' } : undefined}>
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
                    <td className="text-right">
                      <div className="action-icons">
                        <button
                          type="button"
                          className="action-icon-btn"
                          title="Zaplanuj działanie"
                          aria-label={`Zaplanuj działanie — ${row.full_name}, ${row.skill_description}`}
                          onClick={() =>
                            setActionContext({ workerId: row.worker_id, workerName: row.full_name, skillDescription: row.skill_description })
                          }
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
        )}
      </div>

      {actionContext && <ActionPlanModal context={actionContext} onClose={() => setActionContext(null)} />}
    </div>
  );
}
