import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { Button } from '@/components/ui/Button';
import { PaginatedTable } from '@/components/ui/PaginatedTable';
import { SortableTh } from '@/components/ui/SortableTh';
import { Icon } from '@/lib/icons/Icon';
import { useApiData } from '@/lib/api/useApiData';
import { useTableSort } from '@/lib/useTableSort';
import { jobsApi, type JobListItem } from '@/lib/api/jobs';
import { useAuth } from '@/lib/auth/AuthContext';
import { useConfirm } from '@/lib/feedback/ConfirmProvider';
import { useToast } from '@/lib/feedback/ToastProvider';

function getSortValue(row: JobListItem, key: string): string | number | null {
  switch (key) {
    case 'id':
      return row.id;
    case 'description':
      return row.description;
    default:
      return null;
  }
}

export function JobsListPage() {
  const navigate = useNavigate();
  const { isModuleReadOnly } = useAuth();
  const canWrite = !isModuleReadOnly('jobs');
  const confirm = useConfirm();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const { data, loading, error, reload } = useApiData(() => jobsApi.list(search || undefined), [search]);
  const jobs = data?.jobs ?? [];

  const { sorted, sortKey, sortOrder, onSort } = useTableSort(jobs, getSortValue);

  async function handleDelete(e: React.MouseEvent, job: JobListItem) {
    e.stopPropagation();
    const ok = await confirm({
      title: 'Usunąć stanowisko?',
      message: `Stanowisko "${job.id}" zostanie trwale usunięte.`,
      confirmText: 'Usuń',
      type: 'danger',
    });
    if (!ok) return;
    try {
      await jobsApi.remove(job.id);
      toast.success('Stanowisko usunięte.');
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się usunąć stanowiska.');
    }
  }

  function goToView(job: JobListItem) {
    navigate(`/jobs/${encodeURIComponent(job.id)}`);
  }

  return (
    <div className="refined-page">
      <PageHeader
        title="Stanowiska"
        subtitle="Słownik stanowisk pracy"
        actions={
          canWrite && (
            <Button variant="primary" onClick={() => navigate('/jobs/create')}>
              <Icon name="add" size={16} />
              Utwórz
            </Button>
          )
        }
      />

      <div className="search-card">
        <div className="search-wrapper">
          <div className="search-input-wrap">
            <input
              type="text"
              className="refined-input"
              placeholder="Szukaj po kodzie lub opisie…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="table-container" style={{ flex: 1 }}>
        {loading ? (
          <TableSkeleton cols={3} />
        ) : error ? (
          <EmptyState icon="error" title="Nie udało się wczytać danych" message={error} />
        ) : sorted.length === 0 ? (
          <EmptyState icon="work" title="Brak stanowisk" message={search ? 'Żadne stanowisko nie pasuje do wyszukiwania.' : 'Dodaj pierwsze stanowisko.'} />
        ) : (
          <PaginatedTable rows={sorted}>
            {(pageRows) => (
              <table className="refined-table">
                <thead>
                  <tr>
                    <SortableTh label="Kod" sortKey="id" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <SortableTh label="Opis" sortKey="description" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <th className="text-right">Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((j, i) => (
                    <tr
                      key={j.id}
                      onClick={() => goToView(j)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') goToView(j);
                      }}
                      tabIndex={0}
                      style={{ cursor: 'pointer', animationDelay: `${Math.min(i, 7) * 30}ms` }}
                      aria-label={`Zobacz stanowisko ${j.id}`}
                    >
                      <td>{j.id}</td>
                      <td>{j.description ?? '—'}</td>
                      <td>
                        {canWrite && (
                          <div className="action-icons">
                            <button
                              type="button"
                              className="action-icon-btn"
                              title="Edytuj"
                              aria-label={`Edytuj ${j.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/jobs/${encodeURIComponent(j.id)}/edit`);
                              }}
                            >
                              <Icon name="edit" />
                            </button>
                            <button
                              type="button"
                              className="action-icon-btn danger-reveal"
                              title="Usuń"
                              aria-label={`Usuń ${j.id}`}
                              onClick={(e) => handleDelete(e, j)}
                            >
                              <Icon name="delete" />
                            </button>
                          </div>
                        )}
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
