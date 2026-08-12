interface TableSkeletonProps {
  rows?: number;
  cols?: number;
}

/** Row-shaped shimmer placeholder for .refined-table's loading state — reuses
 * the existing .skeleton shimmer (components.css) instead of a "Ładowanie…"
 * text swap, so the table's structure is visible before data arrives. */
export function TableSkeleton({ rows = 6, cols = 4 }: TableSkeletonProps) {
  return (
    <table className="refined-table">
      <tbody>
        {Array.from({ length: rows }).map((_, r) => (
          <tr key={r} style={{ animationDelay: `${r * 30}ms` }}>
            {Array.from({ length: cols }).map((_, c) => (
              <td key={c}>
                <div className="skeleton" style={{ height: '0.875rem', width: c === 0 ? '70%' : '50%', borderRadius: 2 }} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
