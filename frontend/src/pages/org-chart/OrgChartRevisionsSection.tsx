import { useEffect, useRef, useState } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';
import { PaginatedTable } from '@/components/ui/PaginatedTable';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { Icon } from '@/lib/icons/Icon';
import { useApiData } from '@/lib/api/useApiData';
import { orgChartApi } from '@/lib/api/orgChart';

const PAGE_SIZE = 25;

interface OrgChartRevisionsSectionProps {
  open: boolean;
  onToggle: () => void;
}

/**
 * ORG_CHART_PROPOSAL.md §4f — the history-table half of the joined
 * page-view, now an expandable disclosure rather than its own route (the
 * user's UI adjustment: 4e+4f as one page-view, chart then history).
 *
 * Same aria-expanded/aria-controls/role="region" contract as
 * components/layout/SidebarSection.tsx — this app's one existing
 * expand/collapse precedent (itself the ARIA Authoring Practices Guide's
 * "disclosure" pattern: a <button> announces its own expanded state and
 * names the region it controls; the region names itself back via
 * aria-label). Reusing that exact contract here, rather than inventing a
 * second one, is the "if justified by web-react-gui standards" the task
 * asked for — a native <details>/<summary> was the other option, but it
 * would be the second interaction idiom for the same "expand a section"
 * gesture in one app, which DESIGN.md's precedent (cited in §4e) already
 * argues against.
 *
 * Data fetch is lazy — `everOpened` — so a visitor who never expands the
 * history never pays for the (gated-on-'audit', potentially long) paginated
 * query at all.
 */
export function OrgChartRevisionsSection({ open, onToggle }: OrgChartRevisionsSectionProps) {
  const [everOpened, setEverOpened] = useState(open);
  const [page, setPage] = useState(1);
  const itemsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setEverOpened(true);
  }, [open]);

  const { data, loading, error } = useApiData(
    () => (everOpened ? orgChartApi.revisions({ page, page_size: PAGE_SIZE }) : Promise.resolve({ revisions: [], count: 0, page, page_size: PAGE_SIZE })),
    [everOpened, page],
  );
  const revisions = data?.revisions ?? [];

  // Re-measures on every render that can change the region's content height
  // (a page turn going from a skeleton to a full table, or between pages
  // with different row counts) — not just on `open` toggling, or a stale
  // scrollHeight from before the data arrived would clip the table.
  useEffect(() => {
    const el = itemsRef.current;
    if (!el) return;
    el.style.maxHeight = open ? `${el.scrollHeight}px` : '0px';
  }, [open, loading, revisions.length]);

  function handleToggle() {
    if (!open) setEverOpened(true);
    onToggle();
  }

  return (
    <div className="form-card" style={{ padding: 0, overflow: 'hidden' }} id="org-chart-history">
      <button
        type="button"
        className="w-full flex items-center gap-2 select-none"
        style={{ padding: '0.875rem 1.125rem', color: 'var(--color-ink)', fontSize: '0.9375rem', fontWeight: 600 }}
        aria-expanded={open}
        aria-controls="org-chart-history-items"
        onClick={handleToggle}
      >
        <Icon name="history" size={18} />
        Historia zmian struktury
        <Icon
          name="expand_more"
          size={18}
          className="ml-auto transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : undefined }}
        />
      </button>
      <div
        ref={itemsRef}
        id="org-chart-history-items"
        role="region"
        aria-label="Historia zmian struktury"
        className="overflow-hidden transition-[max-height] duration-300 ease-in-out"
      >
        <div style={{ borderTop: '1px solid var(--color-border)', padding: '0.75rem 1.125rem 1.125rem' }}>
          {loading ? (
            <TableSkeleton cols={3} />
          ) : error ? (
            <EmptyState icon="error" title="Nie udało się wczytać historii" message={error} />
          ) : revisions.length === 0 ? (
            <EmptyState icon="history" title="Brak zmian struktury" message="Historia pojawi się po pierwszej zmianie działów lub stanowisk kierowniczych." />
          ) : (
            <PaginatedTable rows={revisions} pageSize={PAGE_SIZE} serverSide={{ page, totalItems: data?.count ?? 0, onPageChange: setPage }}>
              {(pageRows) => (
                <table className="refined-table">
                  <thead>
                    <tr>
                      <th style={{ width: '5rem' }}>Rewizja</th>
                      <th style={{ width: '11rem' }}>Data</th>
                      <th>Zmiana</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r) => (
                      <tr key={r.id}>
                        <td>Rev. {r.id}</td>
                        <td>{new Date(r.revised_at).toLocaleString('pl-PL')}</td>
                        <td>{r.label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </PaginatedTable>
          )}
        </div>
      </div>
    </div>
  );
}
