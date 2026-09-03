import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { SortableTh } from '@/components/ui/SortableTh';
import { Icon } from '@/lib/icons/Icon';
import { useApiData } from '@/lib/api/useApiData';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useTableSort } from '@/lib/useTableSort';
import { bhpApi, type ExpiringBhpTraining } from '@/lib/api/bhp';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { SearchInput } from '@/components/ui/SearchInput';

const KIND_LABELS: Record<ExpiringBhpTraining['kind'], string> = {
  Initial: 'Wstępne',
  Periodic: 'Okresowe',
  Control: 'Kontrolne',
};

const WINDOW_OPTIONS = [
  { value: 30, label: '30 dni' },
  { value: 60, label: '60 dni' },
  { value: 90, label: '90 dni' },
];

const BUCKET_STYLE: Record<ExpiringBhpTraining['bucket'], React.CSSProperties> = {
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

const BUCKET_LABELS: Record<ExpiringBhpTraining['bucket'], string> = {
  critical: 'Pilne (≤30 dni)',
  warning: 'Zbliża się (≤60 dni)',
  notice: 'Do obserwacji (≤90 dni)',
};

/** BHP_5 (IMPLEMENTATION_PLAN.md §9) — global report of soon-expiring/
 * already-expired BHP trainings across active workers, same shape as
 * MedicalExpiringReportPage (see its comment on the shared bucketing). */
function getSortValue(row: ExpiringBhpTraining, key: string): string | number | null {
  switch (key) {
    case 'full_name':
      return row.full_name;
    case 'kind':
      return KIND_LABELS[row.kind];
    case 'training_date':
      return row.training_date;
    case 'valid_until':
      return row.valid_until;
    case 'bucket':
      return BUCKET_LABELS[row.bucket];
    default:
      return null;
  }
}

export function BhpExpiringReportPage() {
  const navigate = useNavigate();
  const [days, setDays] = useState(90);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const { data, loading, error } = useApiData(() => bhpApi.expiring(days), [days]);

  const filtered = useMemo(() => {
    const trainings = data?.trainings ?? [];
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return trainings;
    return trainings.filter((t) => t.full_name.toLowerCase().includes(q));
  }, [data, debouncedSearch]);

  const { sorted, sortKey, sortOrder, onSort } = useTableSort(filtered, getSortValue);

  return (
    <div className="refined-page">
      <PageHeader title="Wygasające szkolenia BHP" subtitle="Raport zbiorczy (BHP_5)" />

      <div className="search-card">
        <div className="search-wrapper">
          <SearchInput value={search} onChange={setSearch} placeholder="Szukaj po pracowniku…" />
          <SearchableSelect
            id="bhp-window"
            ariaLabel="Okno czasowe"
            fullWidth={false}
            triggerClassName="refined-select"
            options={WINDOW_OPTIONS.map((opt) => ({ value: String(opt.value), label: opt.label }))}
            value={String(days)}
            onChange={(v) => setDays(Number(v))}
          />
        </div>
      </div>

      <div className="table-container" style={{ flex: 1 }}>
        {loading ? (
          <TableSkeleton cols={4} />
        ) : error ? (
          <EmptyState icon="error" title="Nie udało się wczytać danych" message={error} />
        ) : sorted.length === 0 ? (
          <EmptyState
            icon="info"
            title="Brak wygasających szkoleń"
            message={search ? 'Żaden pracownik nie pasuje do wyszukiwania.' : 'Żadne szkolenie nie wygasa w wybranym oknie czasowym.'}
          />
        ) : (
          <>
            <div className="table-scroll-body">
              <table className="refined-table">
                <thead>
                  <tr>
                    <SortableTh label="Pracownik" sortKey="full_name" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <SortableTh label="Rodzaj" sortKey="kind" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <SortableTh label="Data szkolenia" sortKey="training_date" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <SortableTh label="Ważne do" sortKey="valid_until" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <SortableTh label="Status" sortKey="bucket" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <th className="row-nav-hint-col" aria-hidden="true"></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((training, i) => (
                    <tr
                      key={training.id}
                      onClick={() => navigate(`/workers/${encodeURIComponent(training.worker_id)}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') navigate(`/workers/${encodeURIComponent(training.worker_id)}`);
                      }}
                      tabIndex={0}
                      style={{
                        cursor: 'pointer',
                        animationDelay: `${Math.min(i, 7) * 30}ms`,
                      }}
                      aria-label={`Zobacz pracownika ${training.full_name}`}
                    >
                      <td>{training.full_name}</td>
                      <td>{KIND_LABELS[training.kind]}</td>
                      <td>{training.training_date ? new Date(training.training_date).toLocaleDateString('pl-PL') : '—'}</td>
                      <td>{training.valid_until ? new Date(training.valid_until).toLocaleDateString('pl-PL') : '—'}</td>
                      <td>
                        <span className="refined-badge" style={BUCKET_STYLE[training.bucket]}>
                          {BUCKET_LABELS[training.bucket]}
                        </span>
                      </td>
                      <td className="row-nav-hint-col">
                        <Icon name="chevron_right" size={16} className="row-nav-hint" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <span>
                {sorted.length} {sorted.length === 1 ? 'wynik' : 'wyników'}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
