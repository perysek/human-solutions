import { useNavigate } from 'react-router-dom';
import { EmptyState } from '@/components/ui/EmptyState';
import type { AlertBucket } from '@/lib/api/dashboard';

export interface AlertPanelRow {
  key: string;
  /** Generic subject id — a worker id for the three original panels, a job
   * id for task 2's orphan-jobs panel. Only meaningful via `onRowClick`
   * (or the default worker-navigate fallback below) — the panel itself
   * never inspects it otherwise. */
  id: string;
  fullName: string;
  detail: string;
  date: string | null;
  bucket: AlertBucket;
}

interface AlertPanelProps {
  title: string;
  rows: AlertPanelRow[];
  emptyMessage: string;
  dateLabel?: string;
  /** Defaults to navigating to /workers/:id (the original three panels'
   * only behaviour). Task 2's orphan-jobs panel passes its own to land on
   * /jobs/:id/edit instead. */
  onRowClick?: (row: AlertPanelRow) => void;
}

/** Same bucket palette as MedicalExpiringReportPage/BhpExpiringReportPage
 * (Faza 4) — kept in sync manually since each report page already
 * duplicates its own copy; DSH_4's foreigner_docs panel only ever passes
 * 'critical'/'warning' rows (see ForeignerDocAlert's type), so 'notice'
 * exists here only for the medical/bhp panels. */
const BUCKET_STYLE: Record<AlertBucket, React.CSSProperties> = {
  critical: { background: 'rgba(155, 44, 44, 0.08)', color: 'var(--color-error)' },
  warning: { background: 'var(--color-orange-bg)', color: 'var(--color-orange)' },
  notice: { background: 'rgba(107, 114, 128, 0.08)', color: 'var(--color-ink-muted)' },
};

const BUCKET_LABELS: Record<AlertBucket, string> = {
  critical: 'Pilne',
  warning: 'Zbliża się',
  notice: 'Do obserwacji',
};

/** Faza 6 (IMPLEMENTATION_PLAN.md §11) — one alert panel card for the
 * pulpit (DSH_2/3/4). Deliberately dumb: DashboardPage normalizes each
 * API shape (medical/bhp/foreigner_docs each have different field names)
 * into this one AlertPanelRow shape before rendering, so this component
 * only ever needs to know about buckets, not domain fields. */
export function AlertPanel({ title, rows, emptyMessage, dateLabel = 'Ważne do', onRowClick }: AlertPanelProps) {
  const navigate = useNavigate();
  const handleClick = onRowClick ?? ((row: AlertPanelRow) => navigate(`/workers/${encodeURIComponent(row.id)}`));

  return (
    <div className="refined-card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 className="text-base font-semibold" style={{ color: 'var(--color-ink)' }}>
          {title}
        </h2>
        <span className="stat-label">{rows.length}</span>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="check_circle" title="Brak alertów" message={emptyMessage} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '20rem', overflowY: 'auto' }}>
          {rows.map((row) => (
            <div
              key={row.key}
              onClick={() => handleClick(row)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleClick(row);
              }}
              tabIndex={0}
              role="button"
              aria-label={`Otwórz szczegóły — ${row.fullName}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                padding: '0.625rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                cursor: 'pointer',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p className="text-sm truncate" style={{ color: 'var(--color-ink)' }}>
                  {row.fullName}
                </p>
                <p className="text-xs truncate" style={{ color: 'var(--color-ink-subtle)' }}>
                  {row.date ? `${row.detail} · ${dateLabel}: ${new Date(row.date).toLocaleDateString('pl-PL')}` : row.detail}
                </p>
              </div>
              <span className="refined-badge" style={{ ...BUCKET_STYLE[row.bucket], flexShrink: 0 }}>
                {BUCKET_LABELS[row.bucket]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
