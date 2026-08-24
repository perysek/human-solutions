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
import { skillsApi, type SkillListItem } from '@/lib/api/skills';
import { useAuth } from '@/lib/auth/AuthContext';
import { useConfirm } from '@/lib/feedback/ConfirmProvider';
import { useToast } from '@/lib/feedback/ToastProvider';

function getSortValue(row: SkillListItem, key: string): string | number | null {
  switch (key) {
    case 'id':
      return row.id;
    case 'description':
      return row.description;
    case 'job_count':
      return row.job_count;
    case 'gap_worker_count':
      return row.gap_worker_count;
    default:
      return null;
  }
}

/** No dedicated SkillViewPage (IMPLEMENTATION_PLAN.md §6 lists JobViewPage
 * but not one for skills) — a skill has only id+description, the same two
 * fields the edit form already shows, so rows navigate straight to edit. */
export function SkillsListPage() {
  const navigate = useNavigate();
  const { isModuleReadOnly } = useAuth();
  const canWrite = !isModuleReadOnly('skills');
  const confirm = useConfirm();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const { data, loading, error, reload } = useApiData(() => skillsApi.list(search || undefined), [search]);
  const skills = data?.skills ?? [];

  const { sorted, sortKey, sortOrder, onSort } = useTableSort(skills, getSortValue);

  function goToEdit(skill: SkillListItem) {
    navigate(`/skills/${encodeURIComponent(skill.id)}/edit`);
  }

  async function handleDelete(e: React.MouseEvent, skill: SkillListItem) {
    e.stopPropagation();
    const ok = await confirm({
      title: 'Usunąć umiejętność?',
      message: `Umiejętność "${skill.id}" zostanie trwale usunięta.`,
      confirmText: 'Usuń',
      type: 'danger',
    });
    if (!ok) return;
    try {
      await skillsApi.remove(skill.id);
      toast.success('Umiejętność usunięta.');
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się usunąć umiejętności.');
    }
  }

  return (
    <div className="refined-page">
      <PageHeader
        title="Umiejętności"
        subtitle="Słownik umiejętności"
        actions={
          canWrite && (
            <Button variant="primary" onClick={() => navigate('/skills/create')}>
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
          <TableSkeleton cols={5} />
        ) : error ? (
          <EmptyState icon="error" title="Nie udało się wczytać danych" message={error} />
        ) : sorted.length === 0 ? (
          <EmptyState icon="checklist" title="Brak umiejętności" message={search ? 'Żadna umiejętność nie pasuje do wyszukiwania.' : 'Dodaj pierwszą umiejętność.'} />
        ) : (
          <PaginatedTable rows={sorted}>
            {(pageRows) => (
              <table className="refined-table">
                <thead>
                  <tr>
                    <SortableTh label="Kod" sortKey="id" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <SortableTh label="Opis" sortKey="description" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <SortableTh label="Powiązanych stanowisk" sortKey="job_count" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <SortableTh label="Pracowników z luką kompetencji" sortKey="gap_worker_count" currentSort={sortKey} currentOrder={sortOrder} onSort={onSort} />
                    <th className="text-right"><span className="sr-only">Akcje</span></th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((s, i) => (
                    <tr
                      key={s.id}
                      onClick={() => canWrite && goToEdit(s)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && canWrite) goToEdit(s);
                      }}
                      tabIndex={canWrite ? 0 : -1}
                      style={{ cursor: canWrite ? 'pointer' : 'default', animationDelay: `${Math.min(i, 7) * 30}ms` }}
                      aria-label={canWrite ? `Edytuj umiejętność ${s.id}` : undefined}
                    >
                      <td>{s.id}</td>
                      <td>{s.description}</td>
                      <td>{s.job_count}</td>
                      <td>{s.gap_worker_count}</td>
                      <td>
                        {canWrite && (
                          <div className="action-icons">
                            <button
                              type="button"
                              className="action-icon-btn"
                              title="Edytuj"
                              aria-label={`Edytuj ${s.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                goToEdit(s);
                              }}
                            >
                              <Icon name="edit" />
                            </button>
                            <button
                              type="button"
                              className="action-icon-btn danger-reveal"
                              title="Usuń"
                              aria-label={`Usuń ${s.id}`}
                              onClick={(e) => handleDelete(e, s)}
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
