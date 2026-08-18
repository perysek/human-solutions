import { Link } from 'react-router-dom';
import { useApiData } from '@/lib/api/useApiData';
import { jobsApi } from '@/lib/api/jobs';

/** JOB_5 — workers currently holding this job. Read-only (assigning a job
 * to a worker happens on the worker's own form, not here). */
export function JobWorkersSection({ jobId }: { jobId: string }) {
  const { data, loading } = useApiData(() => jobsApi.getWorkers(jobId), [jobId]);
  const workers = data?.workers ?? [];

  return (
    <div className="form-card animate-fade-up" style={{ maxWidth: '40rem' }}>
      <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--color-ink)' }}>
        Pracownicy na tym stanowisku
      </h2>
      {loading ? (
        <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.875rem' }}>Ładowanie…</p>
      ) : workers.length === 0 ? (
        <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.875rem' }}>Brak pracowników na tym stanowisku.</p>
      ) : (
        <ul className="space-y-2">
          {workers.map((w) => (
            <li key={w.id} className="flex items-center justify-between">
              <Link to={`/workers/${encodeURIComponent(w.id)}`} style={{ color: 'var(--color-focus-ring)', fontSize: '0.875rem' }}>
                {w.full_name}
              </Link>
              <span className={`status-badge ${w.is_active ? 'active' : 'inactive'}`}>{w.is_active ? 'Aktywny' : 'Nieaktywny'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
