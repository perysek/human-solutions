import { ColumnFilterDropdown, type FilterOption } from './ColumnFilterDropdown';

export type SortOrder = 'asc' | 'desc' | null;

interface ColumnFilterConfig {
  options: FilterOption[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
}

interface SortableThProps {
  label: string;
  sortKey: string;
  currentSort: string | null;
  currentOrder: SortOrder;
  onSort: (key: string) => void;
  align?: 'left' | 'center' | 'right';
  /** Badge-value columns (e.g. Status) get a multi-select filter popover alongside sort. */
  filter?: ColumnFilterConfig;
  /** Applied to the <th> itself — e.g. a narrow `width` + `wordBreak:
   * 'break-word'` so a short numeric column's header wraps onto 2 lines
   * instead of forcing the whole column wide to fit one unbroken line
   * (DepartmentsListPage's "Ilość pracowników"/"Ilość stanowisk"). */
  style?: React.CSSProperties;
}

/**
 * Accessible sortable column header — matches scrollable_table.html's
 * sortable_header() macro: aria-sort on the <th>, a real focusable button
 * inside it (Enter/Space work), a ▲/▼ glyph. Kept in sync on click, so
 * aria-sort never goes stale the way an unmanaged client-sort can.
 */
export function SortableTh({ label, sortKey, currentSort, currentOrder, onSort, align = 'left', filter, style }: SortableThProps) {
  const isActive = currentSort === sortKey;
  const ariaSort = isActive ? (currentOrder === 'asc' ? 'ascending' : 'descending') : 'none';
  const glyph = isActive ? (currentOrder === 'asc' ? '▲' : '▼') : '▲';
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

  return (
    <th className={`th-sortable ${isActive ? 'sort-active' : ''} ${alignClass}`} aria-sort={ariaSort} id={`th-${sortKey}`} style={style}>
      {/* UI-fixes-08092026 — min-width:0 down this whole flex chain
          (th-sort-wrap > th-sort-btn > th-sort-label): a flex item's
          default min-width:auto refuses to shrink below its content's own
          width, which for a fixed-width column silently clips the label
          instead of letting it wrap — invisible until a column is narrow
          enough to expose it (ActionPlansPage's table-layout:fixed did). */}
      <span className="th-sort-wrap">
        <button type="button" className="th-sort-btn" onClick={() => onSort(sortKey)}>
          <span className="th-sort-label">{label}</span>
          <span className="th-sort-icon" id={`si-${sortKey}`} aria-hidden="true">
            {glyph}
          </span>
        </button>
        {filter && <ColumnFilterDropdown columnLabel={label} options={filter.options} selected={filter.selected} onChange={filter.onChange} />}
      </span>
    </th>
  );
}
