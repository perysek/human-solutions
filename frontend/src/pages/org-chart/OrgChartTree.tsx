import { Link } from 'react-router-dom';
import type { OrgChartDepartmentNode, OrgChartTree as OrgChartTreeData } from '@/lib/api/orgChart';

/** Vertical connector — a card down to the horizontal trunk line below it,
 * or the trunk line down to one child. 1px wide, drawn with the same border
 * token every other divider in this app uses, so it stays correct in dark
 * mode without a second color to maintain. */
function Connector() {
  return <div aria-hidden="true" style={{ width: 1, height: 20, background: 'var(--color-border)', flexShrink: 0 }} />;
}

/** One box in the chart — reuses .form-card (the same surface/border/radius
 * every other card in this app uses, see components.css) rather than
 * inventing a parallel "chart node" style. */
function NodeBox({ children, to, highlighted }: { children: React.ReactNode; to?: string; highlighted?: boolean }) {
  const content = (
    <div
      className="form-card animate-fade-up"
      style={{
        padding: '0.625rem 0.875rem',
        minWidth: 170,
        maxWidth: 220,
        textAlign: 'center',
        borderColor: highlighted ? 'var(--color-accent)' : undefined,
        cursor: to ? 'pointer' : undefined,
      }}
    >
      {children}
    </div>
  );
  if (!to) return content;
  return (
    <Link to={to} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }} aria-label="Zobacz szczegóły działu">
      {content}
    </Link>
  );
}

/** Renders `items` in a row, each preceded by its own stub down from a
 * shared horizontal trunk line (the row's own border-top) — the whole
 * group preceded by one more stub connecting it up to the parent box
 * above. Pure layout, no pseudo-elements/new global CSS: a real 1px div
 * for every line segment, matching ORG_CHART_PROPOSAL.md §4e's "simple CSS
 * borders/lines, not a new dependency" call. */
function ChildrenRow({ items }: { items: React.ReactNode[] }) {
  if (items.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <Connector />
      <div style={{ display: 'flex', gap: '1.75rem', borderTop: '1px solid var(--color-border)' }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Connector />
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function DepartmentNode({ dept }: { dept: OrgChartDepartmentNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <NodeBox to={`/departments/${dept.id}/edit`}>
        <p className="font-semibold" style={{ color: 'var(--color-ink)', fontSize: '0.875rem' }}>
          {dept.name}
        </p>
        <p style={{ fontSize: '0.75rem', color: 'var(--color-ink-subtle)', marginTop: '0.25rem' }}>
          Kierownik: {dept.manager?.workers.map((w) => w.full_name).join(', ') || '—'}
        </p>
        {dept.workers.length > 0 && (
          <p style={{ fontSize: '0.75rem', color: 'var(--color-ink-subtle)' }}>
            {dept.workers.length} {dept.workers.length === 1 ? 'pracownik' : 'pracowników'}
          </p>
        )}
      </NodeBox>
      <ChildrenRow items={dept.children.map((child) => <DepartmentNode key={child.id} dept={child} />)} />
    </div>
  );
}

/** ORG_CHART_PROPOSAL.md §4e — the chart half of the joined page-view.
 * Director at the root (department-agnostic, `jobs.is_director`), each
 * top-level department hanging below it, each department's own children
 * recursing the same way. Read-only display; editing stays on the existing
 * Departments/Jobs forms (a NodeBox click routes there) — see the
 * proposal's "explicitly out of scope" §5.
 *
 * `chartRef` (TASK2, export feature) — forwarded onto the INNER content
 * div, not the outer scrollable one: html-to-image rasterizes a node at its
 * actual layout size, and the outer div's on-screen width is clipped to
 * whatever fits before overflow-x:auto kicks in. The inner `width:
 * max-content` div is the full, unclipped chart regardless of current
 * scroll position — the only node exportOrgChart.ts should ever capture. */
export function OrgChartTree({ tree, chartRef }: { tree: OrgChartTreeData; chartRef?: React.RefObject<HTMLDivElement> }) {
  if (!tree.director && tree.departments.length === 0) {
    return (
      <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem 0' }}>
        Brak jeszcze struktury do wyświetlenia — dodaj działy i stanowiska w Działach firmy / Stanowiskach.
      </p>
    );
  }

  return (
    // Two nested containers on purpose: the OUTER one owns scrolling only
    // (no flex/align-items here), the INNER one owns centering via
    // `width: max-content` + `margin: 0 auto` rather than flex's
    // `align-items: center`. Centering a wider-than-container flex child
    // with align-items:center makes browsers start the scroll position
    // in the MIDDLE, clipping equally off both edges until the user
    // scrolls — confirmed visually on a wide chart. margin:auto on a
    // max-content block has no such quirk: it centers when there's room
    // and simply resolves to 0 (flush left, full content reachable by
    // scrolling right) once the content is wider than the container.
    <div style={{ overflowX: 'auto', padding: '0.5rem' }}>
      <div ref={chartRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 'max-content', margin: '0 auto' }}>
        {tree.director && (
          <NodeBox highlighted>
            <p className="font-semibold" style={{ color: 'var(--color-ink)', fontSize: '0.875rem' }}>
              {tree.director.job_description ?? 'Dyrektor zakładu'}
            </p>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-ink-subtle)', marginTop: '0.25rem' }}>
              {tree.director.workers.map((w) => w.full_name).join(', ') || '—'}
            </p>
          </NodeBox>
        )}
        <ChildrenRow items={tree.departments.map((dept) => <DepartmentNode key={dept.id} dept={dept} />)} />
      </div>
    </div>
  );
}
