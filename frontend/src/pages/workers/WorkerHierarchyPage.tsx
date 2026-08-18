import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { useApiData } from '@/lib/api/useApiData';
import { workersApi } from '@/lib/api/workers';
import { useEscapeAction } from '@/lib/a11y/useEscapeAction';

/** WRK_9 — direct reports of one boss (one level, not the transitive tree —
 * see WorkerRepository.get_subordinates's docstring for why). */
export function WorkerHierarchyPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: boss, loading: bossLoading } = useApiData(() => workersApi.get(id as string), [id]);
  const { data, loading, error } = useApiData(() => workersApi.subordinates(id as string), [id]);
  useEscapeAction(() => navigate(`/workers/${id}`));

  const subordinates = data?.subordinates ?? [];

  return (
    <div className="refined-page">
      <PageHeader
        title="Podwładni"
        subtitle={bossLoading ? undefined : boss?.full_name}
        actions={
          <Button variant="secondary" onClick={() => navigate(`/workers/${id}`)}>
            Wróć do profilu
          </Button>
        }
      />

      <div className="table-container" style={{ flex: 1 }}>
        {loading ? (
          <TableSkeleton cols={3} />
        ) : error ? (
          <EmptyState icon="error" title="Nie udało się wczytać danych" message={error} />
        ) : subordinates.length === 0 ? (
          <EmptyState icon="people" title="Brak podwładnych" message="Ten pracownik nie ma nikogo bezpośrednio podległego." />
        ) : (
          <div className="table-scroll-body">
            <table className="refined-table">
              <thead>
                <tr>
                  <th>Imię i nazwisko</th>
                  <th>Stanowisko</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {subordinates.map((w, i) => (
                  <tr
                    key={w.id}
                    onClick={() => navigate(`/workers/${encodeURIComponent(w.id)}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') navigate(`/workers/${encodeURIComponent(w.id)}`);
                    }}
                    tabIndex={0}
                    style={{ cursor: 'pointer', animationDelay: `${Math.min(i, 7) * 30}ms` }}
                    aria-label={`Zobacz pracownika ${w.full_name}`}
                  >
                    <td>{w.full_name}</td>
                    <td>{w.job_description ?? '—'}</td>
                    <td>
                      <span className={`status-badge ${w.is_active ? 'active' : 'inactive'}`}>{w.is_active ? 'Aktywny' : 'Nieaktywny'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="table-footer">
          <span>{subordinates.length} {subordinates.length === 1 ? 'wynik' : 'wyników'}</span>
        </div>
      </div>
    </div>
  );
}
