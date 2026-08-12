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
}

/**
 * Accessible sortable column header — matches scrollable_table.html's
 * sortable_header() macro: aria-sort on the <th>, a real focusable button
 * inside it (Enter/Space work), a ▲/▼ glyph. Kept in sync on click, so
 * aria-sort never goes stale the way an unmanaged client-sort can.
 */
export function SortableTh({ label, sortKey, currentSort, currentOrder, onSort, align = 'left', filter }: SortableThProps) {
  const isActive = currentSort === sortKey;
  const ariaSort = isActive ? (currentOrder === 'asc' ? 'ascending' : 'descending') : 'none';
  const glyph = isActive ? (currentOrder === 'asc' ? '▲' : '▼') : '▲';
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';

  return (
    <th className={`th-sortable ${isActive ? 'sort-active' : ''} ${alignClass}`} aria-sort={ariaSort} id={`th-${sortKey}`}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
        <button type="button" className="th-sort-btn" onClick={() => onSort(sortKey)}>
          <span>{label}</span>
          <span className="th-sort-icon" id={`si-${sortKey}`} aria-hidden="true">
            {glyph}
          </span>
        </button>
        {filter && <ColumnFilterDropdown columnLabel={label} options={filter.options} selected={filter.selected} onChange={filter.onChange} />}
      </span>
    </th>
  );
}
