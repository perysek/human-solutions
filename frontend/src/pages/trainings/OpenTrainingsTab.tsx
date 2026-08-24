import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { ColumnFilterDropdown } from '@/components/ui/ColumnFilterDropdown';
import { useApiData } from '@/lib/api/useApiData';
import { trainingsApi } from '@/lib/api/trainings';
import { ACTION_PLAN_STATUS_OPTIONS } from '@/lib/actionPlanStatus';

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleDateString('pl-PL') : '—';
}

// An open enrollment (get_open_report's own filter) can never have reached
// 'effective' — dropping it here keeps the status filter's option list (and
// its "select all" == "no filter" state) honest about what can actually
// appear in this table.
const STATUS_OPTIONS = ACTION_PLAN_STATUS_OPTIONS.filter((o) => o.value !== 'effective');
const STATUS_BY_VALUE = new Map(STATUS_OPTIONS.map((o) => [o.value, o]));

/** Task 4 — "Szkolenia otwarte": every worker's not-yet-fully-completed
 * training enrollments, grouped under the worker the same way
 * CompetencyGapsReportPage groups its gap rows (first row of a worker's
 * block carries their name, the rest render that cell blank, with a
 * border-top separator between blocks) — rows already arrive worker-first
 * from the backend (TrainingParticipantRepository.get_open_report), so no
 * client-side sort is needed to keep that grouping intact after filtering. */
export function OpenTrainingsTab() {
  const navigate = useNavigate();
  const { data, loading, error } = useApiData(() => trainingsApi.openReport());
  const allRows = useMemo(() => data?.results ?? [], [data]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<Set<string>>(() => new Set(STATUS_OPTIONS.map((o) => o.value)));

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((r) => {
      if (!statusFilter.has(r.status)) return false;
      if (!q) return true;
      return (
        r.worker_name.toLowerCase().includes(q) ||
        r.training_description.toLowerCase().includes(q) ||
        (r.trainer_name ?? '').toLowerCase().includes(q)
      );
    });
  }, [allRows, search, statusFilter]);

  const workerCount = useMemo(() => new Set(rows.map((r) => r.worker_id)).size, [rows]);

  return (
    <>
      <div className="search-card">
        <div className="search-wrapper">
          <div className="search-input-wrap">
            <input
              type="text"
              className="refined-input"
              placeholder="Szukaj po pracowniku, szkoleniu lub prowadzącym…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <ColumnFilterDropdown columnLabel="Status" options={STATUS_OPTIONS} selected={statusFilter} onChange={setStatusFilter} />
        </div>
      </div>

      <div className="table-container" style={{ flex: 1 }}>
        {loading ? (
          <TableSkeleton cols={7} />
        ) : error ? (
          <EmptyState icon="error" title="Nie udało się wczytać danych" message={error} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="check_circle"
            title="Brak otwartych szkoleń"
            message={search || statusFilter.size < STATUS_OPTIONS.length ? 'Żaden wiersz nie pasuje do filtrów.' : 'Każde szkolenie zostało ukończone i potwierdzone jako skuteczne.'}
          />
        ) : (
          <>
            <div className="table-scroll-body">
              <table className="refined-table">
                <thead>
                  <tr>
                    <th>Pracownik</th>
                    <th>Szkolenie</th>
                    <th>Prowadzący</th>
                    <th>Data planowana</th>
                    <th>Data rozpoczęcia</th>
                    <th>Data zakończenia</th>
                    <th>Data oceny skuteczności</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const isFirstOfGroup = idx === 0 || rows[idx - 1].worker_id !== row.worker_id;
                    const status = STATUS_BY_VALUE.get(row.status);
                    return (
                      <tr
                        key={row.participant_id}
                        style={isFirstOfGroup && idx > 0 ? { borderTop: '2px solid var(--color-border)' } : undefined}
                      >
                        {isFirstOfGroup ? (
                          <td
                            onClick={() => navigate(`/workers/${encodeURIComponent(row.worker_id)}`)}
                            style={{ cursor: 'pointer', fontWeight: 500 }}
                            aria-label={`Zobacz pracownika ${row.worker_name}`}
                          >
                            {row.worker_name}
                          </td>
                        ) : (
                          <td />
                        )}
                        <td>
                          <a
                            href={`/trainings/${row.training_id}`}
                            onClick={(e) => {
                              e.preventDefault();
                              navigate(`/trainings/${row.training_id}`);
                            }}
                            style={{ color: 'var(--color-focus-ring)' }}
                          >
                            {row.training_description}
                          </a>
                        </td>
                        <td>{row.trainer_name ?? '—'}</td>
                        <td>{fmt(row.planned_date)}</td>
                        <td>{fmt(row.start_date)}</td>
                        <td>{fmt(row.finish_date)}</td>
                        <td>{fmt(row.effectiveness_date)}</td>
                        <td>
                          {status && (
                            <span className="refined-badge" style={{ color: status.color, background: status.background }}>
                              {status.label}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <span>
                {rows.length} {rows.length === 1 ? 'wynik' : 'wyników'} · {workerCount} {workerCount === 1 ? 'pracownik' : 'pracowników'}
              </span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
