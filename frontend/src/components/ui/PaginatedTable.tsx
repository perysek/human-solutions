import { useEffect, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { Icon } from '@/lib/icons/Icon';
import { SearchableSelect } from './SearchableSelect';

const DEFAULT_PAGE_SIZE = 25;
const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

interface ServerSideConfig {
  /** Current page (1-based) — owned by the caller's fetch state, not this component. */
  page: number;
  /** Total matching rows across ALL pages, from the backend's count — not `rows.length` (that's just this page). */
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

interface PaginatedTableProps<T> {
  /** Client-side mode: the full, already filtered/sorted row set (this
   * component windows it). Server-side mode (`serverSide` set): just the
   * current page's rows, already sliced by the backend. */
  rows: T[];
  pageSize?: number;
  pageSizeOptions?: number[];
  /** Render-prop: build the actual <table> for just the current page's rows —
   * keeps column layout/SortableTh headers fully caller-controlled, this
   * component only owns pagination state and the scroll/footer chrome. */
  children: (pageRows: T[]) => ReactNode;
  /** Switches the component from owning its own `page` state (and slicing
   * `rows` itself) to a controlled component driven by these props — for a
   * dataset large enough that fetching it whole client-side doesn't make
   * sense (Workers: 236 rows, Trainings: 4652). The caller's fetch already
   * did the LIMIT/OFFSET; this component just renders the footer controls
   * and calls back into `onPageChange`/`onPageSizeChange` instead of
   * mutating local state. */
  serverSide?: ServerSideConfig;
}

/**
 * First pagination component in this app (IMPLEMENTATION_PLAN.md §6,
 * cross-cutting decision #7). Built client-side-only against Jobs' small
 * dataset in Phase 1; Phase 2 (Workers, 236 rows, real search/sort/page
 * query params on the backend) added the `serverSide` mode below rather
 * than building a second component — the footer/controls markup and a11y
 * contract stay identical either way, only where `page`/`totalPages` state
 * lives differs.
 */
export function PaginatedTable<T>({
  rows,
  pageSize: initialPageSize = DEFAULT_PAGE_SIZE,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  children,
  serverSide,
}: PaginatedTableProps<T>) {
  const [localPage, setLocalPage] = useState(1);
  const [localPageSize, setLocalPageSize] = useState(initialPageSize);

  // Client mode only: a new search/filter/sort can shrink the row count out
  // from under the current page (e.g. viewing page 3 of 4, then a search
  // narrows to 1 page) — reset to page 1 rather than stranding the user on
  // a page that no longer has any rows. Server mode's caller owns resetting
  // `page` itself (it already has to reset on search/sort change to refetch).
  useEffect(() => {
    if (!serverSide) setLocalPage(1);
  }, [rows.length, serverSide]);

  const pageSize = serverSide ? initialPageSize : localPageSize;
  const totalItems = serverSide ? serverSide.totalItems : rows.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = serverSide ? Math.min(serverSide.page, totalPages) : Math.min(localPage, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageRows = serverSide ? rows : rows.slice(start, start + pageSize);

  function goToPage(next: number) {
    const clamped = Math.max(1, Math.min(totalPages, next));
    if (serverSide) serverSide.onPageChange(clamped);
    else setLocalPage(clamped);
  }

  function changePageSize(size: number) {
    if (serverSide) {
      serverSide.onPageSizeChange?.(size);
    } else {
      setLocalPageSize(size);
      setLocalPage(1);
    }
  }

  return (
    <>
      <div className="table-scroll-body">{children(pageRows)}</div>
      <div className="table-footer">
        <span>
          {totalItems === 0
            ? '0 wyników'
            : `${start + 1}–${Math.min(start + pageSize, totalItems)} z ${totalItems}`}
        </span>
        {totalItems > pageSizeOptions[0] && (
          <div className="flex items-center gap-3" style={{ marginLeft: 'auto' }}>
            {(!serverSide || serverSide.onPageSizeChange) && (
              <span className="flex items-center gap-1.5" style={{ textTransform: 'none', letterSpacing: 'normal' }}>
                Na stronie
                <SearchableSelect
                  id="paginated-table-page-size"
                  ariaLabel="Liczba wyników na stronie"
                  fullWidth={false}
                  triggerClassName="refined-select"
                  triggerStyle={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                  options={pageSizeOptions.map((size) => ({ value: String(size), label: String(size) }))}
                  value={String(pageSize)}
                  onChange={(v) => changePageSize(Number(v))}
                />
              </span>
            )}
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                small
                onClick={() => goToPage(currentPage - 1)}
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
                onClick={() => goToPage(currentPage + 1)}
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
