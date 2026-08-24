import { useState } from 'react';
import type { SortOrder } from '@/components/ui/SortableTh';

/**
 * Same toggle contract as useTableSort ({sortKey, sortOrder, onSort} — click
 * a column, click again to flip direction) but WITHOUT the array-sorting
 * half: the backend does `ORDER BY` now (Workers/Trainings send `sort`/
 * `order` query params), so this hook just tracks which column/direction is
 * selected for the caller to fold into its next fetch.
 */
export function useServerSort(defaultKey: string | null = null, defaultOrder: SortOrder = 'asc') {
  const [sortKey, setSortKey] = useState<string | null>(defaultKey);
  const [sortOrder, setSortOrder] = useState<SortOrder>(defaultOrder);

  function onSort(key: string) {
    if (sortKey === key) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  }

  return { sortKey, sortOrder, onSort };
}
