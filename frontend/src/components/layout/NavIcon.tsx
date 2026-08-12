/**
 * Sidebar-only icon system: 24×24 stroke paths (Heroicons-style), the exact
 * coordinate space the reference sidebar.html uses for nav glyphs — distinct
 * from the 0,-960,960,960 filled-glyph system in lib/icons/Icon.tsx. Do not
 * mix the two: a path from one renders off-canvas in the other's viewBox.
 * See gui-components/sidebar.md §4 "Icon note".
 */
export function NavIcon({ path, className = 'w-5 h-5 shrink-0' }: { path: string; className?: string }) {
  return (
    <svg
      className={`${className} transition-all duration-200`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
    </svg>
  );
}
