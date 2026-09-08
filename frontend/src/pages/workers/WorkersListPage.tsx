import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { Button } from '@/components/ui/Button';
import { PaginatedTable } from '@/components/ui/PaginatedTable';
import { SortableTh } from '@/components/ui/SortableTh';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { SearchInput } from '@/components/ui/SearchInput';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { StatCard } from '@/components/ui/StatCard';
import { Icon } from '@/lib/icons/Icon';
import { useApiData } from '@/lib/api/useApiData';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useServerSort } from '@/lib/useServerSort';
import { workersApi, type WorkerListItem } from '@/lib/api/workers';
import { useAuth } from '@/lib/auth/AuthContext';
import { WORKER_ALERT_CATEGORIES, WORKER_ALERT_INFO, type WorkerAlertCategory } from '@/lib/workerAlerts';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Aktywni' },
  { value: 'inactive', label: 'Nieaktywni' },
  { value: 'all', label: 'Wszyscy' },
];

// task1 (this addendum) — WorkersListPage's second filter dropdown.
const NEEDS_ATTENTION_OPTIONS = [
  { value: 'all', label: 'Wszyscy' },
  { value: 'no', label: 'Nie wymaga uwagi' },
  { value: 'yes', label: 'Wymaga uwagi' },
];

const GENDER_LABELS: Record<string, string> = {
  Male: 'Mężczyzna',
  Female: 'Kobieta',
  UNKNOWN: 'Nie podano',
};

const PAGE_SIZE = 25;

export function WorkersListPage() {
  const navigate = useNavigate();
  const { isModuleReadOnly } = useAuth();
  const canWrite = !isModuleReadOnly('workers');

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active');
  const [needsAttention, setNeedsAttention] = useState<'yes' | 'no' | 'all'>('all');
  // UI-fixes-08092026 task1 — the stat cards' own multi-select filter,
  // independent of (AND'd against) the "Wymaga uwagi" dropdown above.
  const [alertFilters, setAlertFilters] = useState<Set<WorkerAlertCategory>>(new Set());
  const [page, setPage] = useState(1);
  const { sortKey, sortOrder, onSort } = useServerSort('surname', 'asc');

  function resetToFirstPage() {
    setPage(1);
  }

  // Page reset lives on the debounced value's own effect, not search's
  // onChange, so it doesn't fire on every keystroke while typing.
  useEffect(() => {
    resetToFirstPage();
  }, [debouncedSearch]);

  const alertFiltersKey = Array.from(alertFilters).sort().join(',');

  const { data, loading, error } = useApiData(
    () =>
      workersApi.list({
        status,
        search: debouncedSearch || undefined,
        needs_attention: needsAttention,
        alert_categories: alertFilters.size > 0 ? Array.from(alertFilters) : undefined,
        sort: sortKey ?? undefined,
        order: sortOrder ?? undefined,
        page,
        page_size: PAGE_SIZE,
      }),
    // alertFiltersKey (not alertFilters itself) — a Set has no useful
    // identity for a dependency array; the sorted, joined string is what
    // actually needs to compare equal across renders.
    [status, debouncedSearch, needsAttention, alertFiltersKey, sortKey, sortOrder, page],
  );

  // task2 — stat cards atop the page, independent of the table's own
  // filters (a fixed "active roster" summary, same idea as DashboardPage's
  // own cards — they shouldn't jump around as the user types a search).
  const { data: summary, loading: summaryLoading } = useApiData(() => workersApi.needsAttentionSummary());

  const workers = data?.workers ?? [];

  function handleSort(key: string) {
    onSort(key);
    resetToFirstPage();
  }

  // UI-fixes-08092026 task1 — toggling a stat card adds/removes its
  // category from the multi-select filter (OR'd together server-side).
  function toggleAlertFilter(category: WorkerAlertCategory) {
    setAlertFilters((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
    resetToFirstPage();
  }

  // "Łącznie wymaga uwagi" card — selects every category at once; clicking
  // it again (already all-selected) clears the filter entirely.
  const allAlertsSelected = alertFilters.size === WORKER_ALERT_CATEGORIES.length;
  function toggleAllAlertFilters() {
    setAlertFilters(allAlertsSelected ? new Set() : new Set(WORKER_ALERT_CATEGORIES));
    resetToFirstPage();
  }

  function goToView(worker: WorkerListItem) {
    // viewTransition: true — pairs with the matching view-transition-name on
    // the name cell below and on WorkerViewPage's PageHeader subtitle, so
    // the clicked row's name morphs into the detail page's heading instead
    // of hard-cutting to it.
    navigate(`/workers/${encodeURIComponent(worker.id)}`, { viewTransition: true });
  }

  return (
    <div className="refined-page">
      <PageHeader
        title="Pracownicy"
        subtitle="Lista pracowników"
        actions={
          canWrite && (
            <Button variant="primary" onClick={() => navigate('/workers/create')}>
              <Icon name="add" size={16} />
              Utwórz
            </Button>
          )
        }
      />

      <div className="stats-grid stats-grid-compact">
        <StatCard
          label={WORKER_ALERT_INFO.gap.cardLabel}
          value={summaryLoading ? '…' : (summary?.gap_count ?? 0)}
          icon={WORKER_ALERT_INFO.gap.icon}
          color="orange"
          index={0}
          onClick={() => toggleAlertFilter('gap')}
          active={alertFilters.has('gap')}
        />
        <StatCard
          label={WORKER_ALERT_INFO.medical.cardLabel}
          value={summaryLoading ? '…' : (summary?.medical_count ?? 0)}
          icon={WORKER_ALERT_INFO.medical.icon}
          color="orange"
          index={1}
          onClick={() => toggleAlertFilter('medical')}
          active={alertFilters.has('medical')}
        />
        <StatCard
          label={WORKER_ALERT_INFO.bhp.cardLabel}
          value={summaryLoading ? '…' : (summary?.bhp_count ?? 0)}
          icon={WORKER_ALERT_INFO.bhp.icon}
          color="orange"
          index={2}
          onClick={() => toggleAlertFilter('bhp')}
          active={alertFilters.has('bhp')}
        />
        <StatCard
          label={WORKER_ALERT_INFO.onboarding_overdue.cardLabel}
          value={summaryLoading ? '…' : (summary?.onboarding_overdue_count ?? 0)}
          icon={WORKER_ALERT_INFO.onboarding_overdue.icon}
          color="orange"
          index={3}
          onClick={() => toggleAlertFilter('onboarding_overdue')}
          active={alertFilters.has('onboarding_overdue')}
        />
        <StatCard
          label={WORKER_ALERT_INFO.foreigner_doc.cardLabel}
          value={summaryLoading ? '…' : (summary?.foreigner_doc_count ?? 0)}
          icon={WORKER_ALERT_INFO.foreigner_doc.icon}
          color="orange"
          index={4}
          onClick={() => toggleAlertFilter('foreigner_doc')}
          active={alertFilters.has('foreigner_doc')}
        />
        <StatCard
          label="Łącznie wymaga uwagi"
          value={summaryLoading ? '…' : (summary?.total ?? 0)}
          icon="error_outline"
          color="orange"
          index={5}
          onClick={toggleAllAlertFilters}
          active={allAlertsSelected}
        />
      </div>

      <div className="search-card">
        <div className="search-wrapper">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Szukaj po nazwisku, imieniu lub stanowisku…"
          />
          <SearchableSelect
            id="workers-status-filter"
            ariaLabel="Filtruj po statusie"
            fullWidth={false}
            triggerClassName="refined-select"
            options={STATUS_OPTIONS}
            value={status}
            onChange={(v) => {
              setStatus(v as 'active' | 'inactive' | 'all');
              resetToFirstPage();
            }}
          />
          <SearchableSelect
            id="workers-needs-attention-filter"
            ariaLabel="Filtruj po wymaganiu uwagi"
            fullWidth={false}
            triggerClassName="refined-select"
            options={NEEDS_ATTENTION_OPTIONS}
            value={needsAttention}
            onChange={(v) => {
              setNeedsAttention(v as 'yes' | 'no' | 'all');
              resetToFirstPage();
            }}
          />
        </div>
      </div>

      <div className="table-container" style={{ flex: 1 }}>
        {loading ? (
          <TableSkeleton cols={8} />
        ) : error ? (
          <EmptyState icon="error" title="Nie udało się wczytać danych" message={error} />
        ) : workers.length === 0 ? (
          <EmptyState
            icon="people"
            title="Brak pracowników"
            message={search || needsAttention !== 'all' ? 'Żaden pracownik nie pasuje do wyszukiwania/filtrów.' : 'Dodaj pierwszego pracownika.'}
          />
        ) : (
          <PaginatedTable
            rows={workers}
            pageSize={PAGE_SIZE}
            serverSide={{ page, totalItems: data?.count ?? 0, onPageChange: setPage }}
          >
            {(pageRows) => (
              <table className="refined-table">
                <thead>
                  <tr>
                    <SortableTh label="Nazwisko i imię" sortKey="surname" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} />
                    <SortableTh label="Stanowisko" sortKey="job_id" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} />
                    <th>Przełożony</th>
                    <th>Płeć</th>
                    <SortableTh label="Data zatrudnienia" sortKey="hire_date" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} />
                    <SortableTh label="Data zwolnienia" sortKey="fire_date" currentSort={sortKey} currentOrder={sortOrder} onSort={handleSort} />
                    <th>Status</th>
                    <th>Użytkownik</th>
                    <th>Alerty</th>
                    {canWrite && <th className="text-right"><span className="sr-only">Akcje</span></th>}
                    <th className="row-nav-hint-col" aria-hidden="true"></th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((w, i) => (
                    <tr
                      key={w.id}
                      onClick={() => goToView(w)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') goToView(w);
                      }}
                      tabIndex={0}
                      style={{ cursor: 'pointer', animationDelay: `${Math.min(i, 7) * 30}ms` }}
                      aria-label={`Zobacz pracownika ${w.full_name}`}
                    >
                      <td style={{ viewTransitionName: `worker-name-${w.id}` } as React.CSSProperties}>
                        {w.surname} {w.firstname}
                      </td>
                      <td>{w.job_description ?? '—'}</td>
                      <td>{w.boss_name ?? '—'}</td>
                      <td>{GENDER_LABELS[w.gender] ?? w.gender}</td>
                      <td>{w.hire_date ? new Date(w.hire_date).toLocaleDateString('pl-PL') : '—'}</td>
                      <td>{w.fire_date ? new Date(w.fire_date).toLocaleDateString('pl-PL') : '—'}</td>
                      <td>
                        <StatusBadge status={w.is_active ? 'active' : 'inactive'}>{w.is_active ? 'Aktywny' : 'Nieaktywny'}</StatusBadge>
                      </td>
                      <td>
                        <span
                          className={`status-badge ${w.linked_user_id ? 'active' : 'inactive'}`}
                          title={w.linked_user_email ?? undefined}
                        >
                          {w.linked_user_id ? 'Przypisany' : 'Brak'}
                        </span>
                      </td>
                      <td>
                        {w.alerts.length === 0 ? (
                          <span style={{ color: 'var(--color-ink-subtle)' }}>—</span>
                        ) : (
                          <div className="alert-badge-grid">
                            {w.alerts.slice(0, 6).map((key) => {
                              const info = WORKER_ALERT_INFO[key as WorkerAlertCategory];
                              if (!info) return null;
                              return (
                                <span
                                  key={key}
                                  className={`alert-badge-chip ${info.tone}`}
                                  title={info.badgeLabel}
                                  aria-label={info.badgeLabel}
                                >
                                  <Icon name={info.icon} size={14} />
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      {canWrite && (
                        <td>
                          <div className="action-icons">
                            <button
                              type="button"
                              className="action-icon-btn"
                              title="Edytuj"
                              aria-label={`Edytuj ${w.full_name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/workers/${encodeURIComponent(w.id)}/edit`);
                              }}
                            >
                              <Icon name="edit" />
                            </button>
                          </div>
                        </td>
                      )}
                      <td className="row-nav-hint-col">
                        <Icon name="chevron_right" size={16} className="row-nav-hint" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </PaginatedTable>
        )}
      </div>
    </div>
  );
}
