import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { useApiData } from '@/lib/api/useApiData';
import { bhpApi, type ExpiringBhpTraining } from '@/lib/api/bhp';
import { SelectWrap } from '@/components/ui/SelectWrap';

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
  critical: { background: 'rgba(155, 44, 44, 0.08)', color: 'var(--color-error)' },
  warning: { background: 'var(--color-orange-bg)', color: 'var(--color-orange)' },
  notice: { background: 'rgba(107, 114, 128, 0.08)', color: 'var(--color-ink-muted)' },
};

const BUCKET_LABELS: Record<ExpiringBhpTraining['bucket'], string> = {
  critical: 'Pilne (≤30 dni)',
  warning: 'Zbliża się (≤60 dni)',
  notice: 'Do obserwacji (≤90 dni)',
};

/** BHP_5 (IMPLEMENTATION_PLAN.md §9) — global report of soon-expiring/
 * already-expired BHP trainings across active workers, same shape as
 * MedicalExpiringReportPage (see its comment on the shared bucketing). */
export function BhpExpiringReportPage() {
  const navigate = useNavigate();
  const [days, setDays] = useState(90);
  const { data, loading, error } = useApiData(() => bhpApi.expiring(days), [days]);
  const trainings = data?.trainings ?? [];

  return (
    <div className="refined-page">
      <PageHeader title="Wygasające szkolenia BHP" subtitle="Raport zbiorczy (BHP_5)" />

      <div className="search-card">
        <div className="search-wrapper">
          <SelectWrap inline>
            <select className="refined-select" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Okno czasowe">
              {WINDOW_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </SelectWrap>
        </div>
      </div>

      <div className="table-container" style={{ flex: 1 }}>
        {loading ? (
          <TableSkeleton cols={4} />
        ) : error ? (
          <EmptyState icon="error" title="Nie udało się wczytać danych" message={error} />
        ) : trainings.length === 0 ? (
          <EmptyState icon="info" title="Brak wygasających szkoleń" message="Żadne szkolenie nie wygasa w wybranym oknie czasowym." />
        ) : (
          <table className="refined-table">
            <thead>
              <tr>
                <th>Pracownik</th>
                <th>Rodzaj</th>
                <th>Data szkolenia</th>
                <th>Ważne do</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {trainings.map((training) => (
                <tr
                  key={training.id}
                  onClick={() => navigate(`/workers/${encodeURIComponent(training.worker_id)}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') navigate(`/workers/${encodeURIComponent(training.worker_id)}`);
                  }}
                  tabIndex={0}
                  style={{ cursor: 'pointer' }}
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
