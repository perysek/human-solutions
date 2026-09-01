import type { DepartmentListItem } from '@/lib/api/departments';

/**
 * DESCENDANTS of `rootId` (walking DOWN the tree) — the mirror image of
 * DepartmentRepository.get_ancestry (repositories/departments/
 * department_repository.py), which walks UP. Purely client-side from an
 * already-fetched flat department list — every department already carries
 * its own parent_department_id, so the full tree is reconstructible without
 * a dedicated endpoint.
 *
 * Used by DepartmentForm's parent-picker (edit mode only) to exclude a
 * department from being offered as its own descendant's parent — an
 * obviously-invalid cycle the UI shouldn't even present, ahead of the
 * server's authoritative would_create_cycle check.
 */
export function getDescendantIds(rootId: number, all: DepartmentListItem[]): Set<number> {
  const childrenOf = new Map<number, number[]>();
  for (const d of all) {
    if (d.parent_department_id != null) {
      childrenOf.set(d.parent_department_id, [...(childrenOf.get(d.parent_department_id) ?? []), d.id]);
    }
  }
  const result = new Set<number>();
  const stack = [...(childrenOf.get(rootId) ?? [])];
  while (stack.length) {
    const next = stack.pop()!;
    if (result.has(next)) continue; // defensive: never loop even over already-bad data
    result.add(next);
    stack.push(...(childrenOf.get(next) ?? []));
  }
  return result;
}

/**
 * Flattens `all` into depth-first tree order (a top-level department
 * immediately followed by all of its descendants, each level sorted by
 * name) with a `depth` alongside each row — DepartmentsListPage's hierarchy
 * view (§4d) uses `depth` to indent a row under its parent instead of
 * scattering children wherever their name would otherwise sort
 * alphabetically in a flat list.
 *
 * Same defensive cycle guard as getDescendantIds — a department that (by
 * data corruption, not through this UI) ends up as its own ancestor is
 * skipped rather than infinite-looped.
 */
export function toDepartmentTreeOrder(all: DepartmentListItem[]): { department: DepartmentListItem; depth: number }[] {
  const childrenOf = new Map<number | null, DepartmentListItem[]>();
  for (const d of all) {
    const key = d.parent_department_id;
    childrenOf.set(key, [...(childrenOf.get(key) ?? []), d]);
  }
  for (const siblings of childrenOf.values()) {
    siblings.sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  }

  const result: { department: DepartmentListItem; depth: number }[] = [];
  const visited = new Set<number>();

  function visit(dept: DepartmentListItem, depth: number) {
    if (visited.has(dept.id)) return;
    visited.add(dept.id);
    result.push({ department: dept, depth });
    for (const child of childrenOf.get(dept.id) ?? []) {
      visit(child, depth + 1);
    }
  }

  for (const topLevel of childrenOf.get(null) ?? []) {
    visit(topLevel, 0);
  }
  // Anything not reached from a top-level root (an orphaned or, on bad
  // data, cyclic branch) still needs to show up somewhere rather than
  // silently vanish from the list.
  for (const d of all) {
    if (!visited.has(d.id)) visit(d, 0);
  }
  return result;
}
