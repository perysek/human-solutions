import { useMemo, useState } from 'react';
import type { SortOrder } from '@/components/ui/SortableTh';

/** Client-side sort for the small (dev-seed-sized) lists this app renders. */
export function useTableSort<T>(rows: T[] | null | undefined, getValue: (row: T, key: string) => string | number | null) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  function onSort(key: string) {
    if (sortKey === key) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  }

  const sorted = useMemo(() => {
    if (!rows) return [];
    if (!sortKey) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = getValue(a, sortKey);
      const bv = getValue(b, sortKey);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return av - bv;
      return String(av).localeCompare(String(bv), 'pl');
    });
    if (sortOrder === 'desc') copy.reverse();
    return copy;
  }, [rows, sortKey, sortOrder, getValue]);

  return { sorted, sortKey, sortOrder, onSort };
}
