import { Link } from 'react-router-dom';
import { useApiData } from '@/lib/api/useApiData';
import { trainingsApi } from '@/lib/api/trainings';

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleDateString('pl-PL') : '—';
}

/** TRN_10 — a worker's training history, read-only (registration/editing
 * happens from the training's own page, not here). GET /trainings/api/worker/<id>/history
 * gates on role_required('superadmin', 'hr_manager') — no extra frontend
 * check needed since WorkerViewPage itself is only reachable by those two
 * roles (router.tsx's requireModule="workers" gate). */
export function WorkerTrainingHistorySection({ workerId }: { workerId: string }) {
  const { data, loading } = useApiData(() => trainingsApi.workerHistory(workerId), [workerId]);
  const history = data?.history ?? [];

  return (
    <div className="form-card animate-fade-up" style={{ maxWidth: '48rem' }}>
      <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--color-ink)' }}>
        Historia szkoleń
      </h2>

      {loading ? (
        <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.875rem' }}>Ładowanie…</p>
      ) : history.length === 0 ? (
        <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.875rem' }}>Brak odbytych szkoleń.</p>
      ) : (
        <table className="refined-table">
          <thead>
            <tr>
              <th>Szkolenie</th>
              <th>Data</th>
              <th>Trener</th>
              <th>Skuteczność</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.participant_id}>
                <td>
                  <Link to={`/trainings/${h.training_id}`} style={{ color: 'var(--color-focus-ring)' }}>
                    {h.training_description}
                  </Link>
                </td>
                <td>{fmt(h.training_date)}</td>
                <td>{h.trainer_name ?? '—'}</td>
                <td>{fmt(h.effectiveness_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
