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
import { departmentsApi, type DepartmentListItem } from '@/lib/api/departments';
import { useAuth } from '@/lib/auth/AuthContext';
import { useConfirm } from '@/lib/feedback/ConfirmProvider';
import { useToast } from '@/lib/feedback/ToastProvider';
import { AddJobsToDepartmentModal } from './AddJobsToDepartmentModal';

function getSortValue(row: DepartmentListItem, key: string): string | number | null {
  switch (key) {
    case 'name':
      return row.name;
    case 'manager_names':
      return row.manager_names;
    case 'description':
      return row.description;
    case 'worker_count':
      return row.worker_count;
    case 'job_count':
      return row.job_count;
    default:
      return null;
  }
}

// Narrow numeric columns — an explicit width lets the header wrap onto 2
// lines instead of the browser widening the whole column to fit "Ilość
// pracowników" on one line, the way unconstrained <th>s do. Wide enough to
// fit the longer of the two words ("PRACOWNIKÓW", uppercased by
// .refined-table th) on its own line — overflow-wrap (not word-break) so
// it only splits mid-word as a last resort, keeping it to 2 clean lines
// ("ILOŚĆ" / "PRACOWNIKÓW") rather than breaking every few characters.
const NARROW_COUNT_TH_STYLE: React.CSSProperties = { width: '7.5rem', whiteSpace: 'normal', overflowWrap: 'break-word' };

/** "Działy firmy" — task1. No dedicated view page (same call as
 * SkillsListPage: two editable fields plus computed columns that only make
 * sense in the row context) — rows navigate straight to edit. */
export function DepartmentsListPage() {
  const navigate = useNavigate();
  // Piggybacks on the 'jobs' module grant — departments only exist as a
  // job-position attribute, see routes/departments/routes.py's docstring.
  const { isModuleReadOnly } = useAuth();
  const canWrite = !isModuleReadOnly('jobs');
  const confirm = useConfirm();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [addJobsFor, setAddJobsFor] = useState<DepartmentListItem | null>(null);
  const { data, loading, error, reload } = useApiData(() => departmentsApi.list(search || undefined), [search]);
  const departments = data?.departments ?? [];

  const { sorted, sortKey, sortOrder, onSort } = useTableSort(departments, getSortValue);

  function goToEdit(department: DepartmentListItem) {
    navigate(`/departments/${department.id}/edit`);
  }

  async function handleDelete(e: React.MouseEvent, department: DepartmentListItem) {
    e.stopPropagation();
    const ok = await confirm({
      title: 'Usunąć dział?',
      message: `Dział "${department.name}" zostanie trwale usunięty.`,
      confirmText: 'Usuń',
      type: 'danger',
    });
    if (!ok) return;
    try {
      await departmentsApi.remove(department.id);
      toast.success('Dział usunięty.');
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się usunąć działu.');
    }
  }

  return (
    <div className="refined-page">
      <PageHeader
        title="Działy firmy"
        subtitle="Słownik działów firmy"
        actions={
          canWrite && (
            <Button variant="primary" onClick={() => navigate('/departments/create')}>
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
              placeholder="Szukaj po nazwie lub opisie…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="table-container" style={{ flex: 1 }}>
        {loading ? (
          <TableSkeleton cols={6} />
        ) : error ? (
          <EmptyState icon="error" title="Nie udało się wczytać danych" message={error} />
        ) : sorted.length === 0 ? (
          <EmptyState icon="category" title="Brak działów" message={search ? 'Żaden dział nie pasuje do wyszukiwania.' : 'Dodaj pierwszy dział.'} />
        ) : (
          <PaginatedTable rows={sorted}>
            {(pageRows) => (
              <table className="refined-table">
                <thead>
                  <tr>
                    <SortableTh label="Nazwa działu" sortKey="name" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <SortableTh label="Kierownik działu" sortKey="manager_names" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <SortableTh label="Opis" sortKey="description" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <SortableTh
                      label="Ilość pracowników"
                      sortKey="worker_count"
                      currentSort={sortKey}
                      currentOrder={sortOrder}
                      onSort={onSort}
                      align="center"
                      style={NARROW_COUNT_TH_STYLE}
                    />
                    <SortableTh
                      label="Ilość stanowisk"
                      sortKey="job_count"
                      currentSort={sortKey}
                      currentOrder={sortOrder}
                      onSort={onSort}
                      align="center"
                      style={NARROW_COUNT_TH_STYLE}
                    />
                    <th className="text-right"><span className="sr-only">Akcje</span></th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((d, i) => (
                    <tr
                      key={d.id}
                      onClick={() => canWrite && goToEdit(d)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && canWrite) goToEdit(d);
                      }}
                      tabIndex={canWrite ? 0 : -1}
                      style={{ cursor: canWrite ? 'pointer' : 'default', animationDelay: `${Math.min(i, 7) * 30}ms` }}
                      aria-label={canWrite ? `Edytuj dział ${d.name}` : undefined}
                    >
                      <td>{d.name}</td>
                      <td>{d.manager_names ?? '—'}</td>
                      <td>{d.description ?? '—'}</td>
                      <td className="text-center">{d.worker_count}</td>
                      <td className="text-center">{d.job_count}</td>
                      <td>
                        {canWrite && (
                          <div className="action-icons">
                            <button
                              type="button"
                              className="action-icon-btn"
                              title="Dodaj stanowiska"
                              aria-label={`Dodaj stanowiska do działu ${d.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setAddJobsFor(d);
                              }}
                            >
                              <Icon name="add" />
                            </button>
                            <button
                              type="button"
                              className="action-icon-btn"
                              title="Edytuj"
                              aria-label={`Edytuj ${d.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                goToEdit(d);
                              }}
                            >
                              <Icon name="edit" />
                            </button>
                            <button
                              type="button"
                              className="action-icon-btn danger-reveal"
                              title="Usuń"
                              aria-label={`Usuń ${d.name}`}
                              onClick={(e) => handleDelete(e, d)}
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

      {addJobsFor && (
        <AddJobsToDepartmentModal
          departmentId={addJobsFor.id}
          departmentName={addJobsFor.name}
          onClose={() => setAddJobsFor(null)}
          onAdded={reload}
        />
      )}
    </div>
  );
}
