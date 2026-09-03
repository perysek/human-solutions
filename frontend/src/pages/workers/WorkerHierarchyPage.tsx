import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { SortableTh } from '@/components/ui/SortableTh';
import { SearchInput } from '@/components/ui/SearchInput';
import { Icon } from '@/lib/icons/Icon';
import { useApiData } from '@/lib/api/useApiData';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useTableSort } from '@/lib/useTableSort';
import { workersApi, type WorkerListItem } from '@/lib/api/workers';
import { useEscapeAction } from '@/lib/a11y/useEscapeAction';

function getSortValue(row: WorkerListItem, key: string): string | number | null {
  switch (key) {
    case 'full_name':
      return row.full_name;
    case 'job_description':
      return row.job_description;
    case 'is_active':
      return row.is_active ? 1 : 0;
    default:
      return null;
  }
}

/** WRK_9 — direct reports of one boss (one level, not the transitive tree —
 * see WorkerRepository.get_subordinates's docstring for why). */
export function WorkerHierarchyPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: boss, loading: bossLoading } = useApiData(() => workersApi.get(id as string), [id]);
  const { data, loading, error } = useApiData(() => workersApi.subordinates(id as string), [id]);
  useEscapeAction(() => navigate(`/workers/${id}`));

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const allSubordinates = useMemo(() => data?.subordinates ?? [], [data]);
  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return allSubordinates;
    return allSubordinates.filter((w) => w.full_name.toLowerCase().includes(q));
  }, [allSubordinates, debouncedSearch]);
  const { sorted: subordinates, sortKey, sortOrder, onSort } = useTableSort(filtered, getSortValue);

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

      <div className="search-card">
        <div className="search-wrapper">
          <SearchInput value={search} onChange={setSearch} placeholder="Szukaj po imieniu lub nazwisku…" />
        </div>
      </div>

      <div className="table-container" style={{ flex: 1 }}>
        {loading ? (
          <TableSkeleton cols={3} />
        ) : error ? (
          <EmptyState icon="error" title="Nie udało się wczytać danych" message={error} />
        ) : subordinates.length === 0 ? (
          <EmptyState
            icon="people"
            title="Brak podwładnych"
            message={search ? 'Żaden podwładny nie pasuje do wyszukiwania.' : 'Ten pracownik nie ma nikogo bezpośrednio podległego.'}
          />
        ) : (
          <div className="table-scroll-body">
            <table className="refined-table">
              <thead>
                <tr>
                  <SortableTh label="Imię i nazwisko" sortKey="full_name" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                  <SortableTh label="Stanowisko" sortKey="job_description" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                  <SortableTh label="Status" sortKey="is_active" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                  <th className="row-nav-hint-col" aria-hidden="true"></th>
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
                    style={{
                      cursor: 'pointer',
                      animationDelay: `${Math.min(i, 7) * 30}ms`,
                    }}
                    aria-label={`Zobacz pracownika ${w.full_name}`}
                  >
                    <td>{w.full_name}</td>
                    <td>{w.job_description ?? '—'}</td>
                    <td>
                      <span className={`status-badge ${w.is_active ? 'active' : 'inactive'}`}>{w.is_active ? 'Aktywny' : 'Nieaktywny'}</span>
                    </td>
                    <td className="row-nav-hint-col">
                      <Icon name="chevron_right" size={16} className="row-nav-hint" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="table-footer">
          <span>
            {subordinates.length} {subordinates.length === 1 ? 'wynik' : 'wyników'}
          </span>
        </div>
      </div>
    </div>
  );
}
