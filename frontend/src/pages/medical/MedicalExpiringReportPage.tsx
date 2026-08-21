import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { useApiData } from '@/lib/api/useApiData';
import { medicalApi, type ExpiringMedicalExam } from '@/lib/api/medical';
import { SelectWrap } from '@/components/ui/SelectWrap';

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
  critical: { background: 'rgba(155, 44, 44, 0.08)', color: 'var(--color-error)' },
  warning: { background: 'var(--color-orange-bg)', color: 'var(--color-orange)' },
  notice: { background: 'rgba(107, 114, 128, 0.08)', color: 'var(--color-ink-muted)' },
};

const BUCKET_LABELS: Record<ExpiringMedicalExam['bucket'], string> = {
  critical: 'Pilne (≤30 dni)',
  warning: 'Zbliża się (≤60 dni)',
  notice: 'Do obserwacji (≤90 dni)',
};

/** MED_6 (IMPLEMENTATION_PLAN.md §9) — global report of soon-expiring/
 * already-expired medical exams across active workers, color-coded by the
 * shared alert_service bucketing (critical/warning/notice). */
export function MedicalExpiringReportPage() {
  const navigate = useNavigate();
  const [days, setDays] = useState(90);
  const { data, loading, error } = useApiData(() => medicalApi.expiring(days), [days]);
  const exams = data?.exams ?? [];

  return (
    <div className="refined-page">
      <PageHeader title="Wygasające badania lekarskie" subtitle="Raport zbiorczy (MED_6)" />

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
          <TableSkeleton cols={5} />
        ) : error ? (
          <EmptyState icon="error" title="Nie udało się wczytać danych" message={error} />
        ) : exams.length === 0 ? (
          <EmptyState icon="info" title="Brak wygasających badań" message="Żadne badanie nie wygasa w wybranym oknie czasowym." />
        ) : (
          <table className="refined-table">
            <thead>
              <tr>
                <th>Pracownik</th>
                <th>Rodzaj</th>
                <th>Data badania</th>
                <th>Ważne do</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {exams.map((exam) => (
                <tr
                  key={exam.id}
                  onClick={() => navigate(`/workers/${encodeURIComponent(exam.worker_id)}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') navigate(`/workers/${encodeURIComponent(exam.worker_id)}`);
                  }}
                  tabIndex={0}
                  style={{ cursor: 'pointer' }}
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
        )}
      </div>
    </div>
  );
}
