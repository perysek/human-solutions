import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { SortableTh } from '@/components/ui/SortableTh';
import { useApiData } from '@/lib/api/useApiData';
import { useTableSort } from '@/lib/useTableSort';
import { medicalApi, type ExpiringMedicalExam } from '@/lib/api/medical';
import { SearchableSelect } from '@/components/ui/SearchableSelect';

const KIND_LABELS: Record<ExpiringMedicalExam['kind'], string> = {
  Preliminary: 'Wstępne',
  Periodic: 'Okresowe',
};

const WINDOW_OPTIONS = [
  { value: 30, label: '30 dni' },
  { value: 60, label: '60 dni' },
  { value: 90, label: '90 dni' },
];

const BUCKET_STYLE: Record<ExpiringMedicalExam['bucket'], React.CSSProperties> = {
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

const BUCKET_LABELS: Record<ExpiringMedicalExam['bucket'], string> = {
  critical: 'Pilne (≤30 dni)',
  warning: 'Zbliża się (≤60 dni)',
  notice: 'Do obserwacji (≤90 dni)',
};

/** MED_6 (IMPLEMENTATION_PLAN.md §9) — global report of soon-expiring/
 * already-expired medical exams across active workers, color-coded by the
 * shared alert_service bucketing (critical/warning/notice). */
function getSortValue(row: ExpiringMedicalExam, key: string): string | number | null {
  switch (key) {
    case 'full_name':
      return row.full_name;
    case 'kind':
      return KIND_LABELS[row.kind];
    case 'performed_on':
      return row.performed_on;
    case 'valid_until':
      return row.valid_until;
    case 'bucket':
      return BUCKET_LABELS[row.bucket];
    default:
      return null;
  }
}

export function MedicalExpiringReportPage() {
  const navigate = useNavigate();
  const [days, setDays] = useState(90);
  const [search, setSearch] = useState('');
  const { data, loading, error } = useApiData(() => medicalApi.expiring(days), [days]);

  const filtered = useMemo(() => {
    const exams = data?.exams ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return exams;
    return exams.filter((e) => e.full_name.toLowerCase().includes(q));
  }, [data, search]);

  const { sorted, sortKey, sortOrder, onSort } = useTableSort(filtered, getSortValue);

  return (
    <div className="refined-page">
      <PageHeader title="Wygasające badania lekarskie" subtitle="Raport zbiorczy (MED_6)" />

      <div className="search-card">
        <div className="search-wrapper">
          <div className="search-input-wrap">
            <input
              type="text"
              className="refined-input"
              placeholder="Szukaj po pracowniku…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <SearchableSelect
            id="medical-window"
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
          <TableSkeleton cols={5} />
        ) : error ? (
          <EmptyState icon="error" title="Nie udało się wczytać danych" message={error} />
        ) : sorted.length === 0 ? (
          <EmptyState
            icon="info"
            title="Brak wygasających badań"
            message={search ? 'Żaden pracownik nie pasuje do wyszukiwania.' : 'Żadne badanie nie wygasa w wybranym oknie czasowym.'}
          />
        ) : (
          <>
            <div className="table-scroll-body">
              <table className="refined-table">
                <thead>
                  <tr>
                    <SortableTh label="Pracownik" sortKey="full_name" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <SortableTh label="Rodzaj" sortKey="kind" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <SortableTh label="Data badania" sortKey="performed_on" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <SortableTh label="Ważne do" sortKey="valid_until" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <SortableTh label="Status" sortKey="bucket" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((exam, i) => (
                    <tr
                      key={exam.id}
                      onClick={() => navigate(`/workers/${encodeURIComponent(exam.worker_id)}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') navigate(`/workers/${encodeURIComponent(exam.worker_id)}`);
                      }}
                      tabIndex={0}
                      style={{
                        cursor: 'pointer',
                        animationDelay: `${Math.min(i, 7) * 30}ms`,
                      }}
                      aria-label={`Zobacz pracownika ${exam.full_name}`}
                    >
                      <td>{exam.full_name}</td>
                      <td>{KIND_LABELS[exam.kind]}</td>
                      <td>{exam.performed_on ? new Date(exam.performed_on).toLocaleDateString('pl-PL') : '—'}</td>
                      <td>{exam.valid_until ? new Date(exam.valid_until).toLocaleDateString('pl-PL') : '—'}</td>
                      <td>
                        <span className="refined-badge" style={BUCKET_STYLE[exam.bucket]}>
                          {BUCKET_LABELS[exam.bucket]}
                        </span>
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
