import { useEffect, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { Icon } from '@/lib/icons/Icon';

const DEFAULT_PAGE_SIZE = 25;
const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

interface PaginatedTableProps<T> {
  /** The full, already filtered/sorted row set — this component windows it client-side. */
  rows: T[];
  pageSize?: number;
  pageSizeOptions?: number[];
  /** Render-prop: build the actual <table> for just the current page's rows —
   * keeps column layout/SortableTh headers fully caller-controlled, this
   * component only owns pagination state and the scroll/footer chrome. */
  children: (pageRows: T[]) => ReactNode;
}

/**
 * First real pagination component in this app (IMPLEMENTATION_PLAN.md §6,
 * cross-cutting decision #7) — every list page before this rendered its full
 * (dev-seed-sized) row set with only client-side sort/filter via
 * useTableSort. Built here against Jobs' small dataset (~52 rows) before
 * reuse on Workers (236), Trainings (4652) and the audit log.
 *
 * Client-side windowing only: slices an already-fetched `rows` array. A
 * dataset large enough to need server-side paging (Trainings' 4652 rows)
 * needs a different data-fetching shape — the backend accepting `page`/
 * `page_size` and returning just that slice — at which point the caller
 * passes that page's rows straight through here with `pageSize` matching the
 * server's page size and drives `page` from its own fetch instead of this
 * component's internal state. That reshaping is out of scope for Phase 1;
 * this component's public contract (a footer + a windowed render-prop) is
 * designed to still fit either shape when that day comes.
 */
export function PaginatedTable<T>({
  rows,
  pageSize: initialPageSize = DEFAULT_PAGE_SIZE,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  children,
}: PaginatedTableProps<T>) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  // A new search/filter/sort can shrink the row count out from under the
  // current page (e.g. viewing page 3 of 4, then a search narrows to 1 page)
  // — reset to page 1 whenever the underlying set size changes, rather than
  // stranding the user on a page that no longer has any rows.
  useEffect(() => {
    setPage(1);
  }, [rows.length]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  return (
    <>
      <div className="table-scroll-body">{children(pageRows)}</div>
      <div className="table-footer">
        <span>
          {rows.length === 0
            ? '0 wyników'
            : `${start + 1}–${Math.min(start + pageSize, rows.length)} z ${rows.length}`}
        </span>
        {rows.length > pageSizeOptions[0] && (
          <div className="flex items-center gap-3" style={{ marginLeft: 'auto' }}>
            <label className="flex items-center gap-1.5" style={{ textTransform: 'none', letterSpacing: 'normal' }}>
              Na stronie
              <select
                className="refined-select"
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                aria-label="Liczba wyników na stronie"
              >
                {pageSizeOptions.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                small
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                aria-label="Poprzednia strona"
              >
                <Icon name="chevron_left" size={16} />
              </Button>
              <span style={{ textTransform: 'none', letterSpacing: 'normal' }}>
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="ghost"
                small
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                aria-label="Następna strona"
              >
                <Icon name="chevron_right" size={16} />
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
