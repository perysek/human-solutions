import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from '@/lib/icons/Icon';

interface SidebarSectionProps {
  id: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/**
 * One accordion group in the sidebar nav. Single-open behaviour lives in the
 * parent <Sidebar> (it owns `openSectionId`); this component only owns the
 * max-height measure/animate dance, mirroring the original inline <script>
 * in templates/components/sidebar.html (expand/collapse + debounced resize
 * re-measure, since the height is pinned to a scrollHeight px snapshot).
 */
export function SidebarSection({ id, title, open, onToggle, children }: SidebarSectionProps) {
  const itemsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = itemsRef.current;
    if (!el) return;
    el.style.maxHeight = open ? `${el.scrollHeight}px` : '0px';
  }, [open, children]);

  useEffect(() => {
    if (!open) return;
    let timer: number | undefined;
    function onResize() {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const el = itemsRef.current;
        if (el) el.style.maxHeight = `${el.scrollHeight}px`;
      }, 120);
    }
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.clearTimeout(timer);
    };
  }, [open]);

  return (
    <div className="sidebar-section mt-4 first:mt-2" data-active={open ? 'true' : 'false'}>
      <button
        type="button"
        className="sidebar-section-header w-full px-2 mb-1 text-base font-semibold uppercase tracking-wider flex items-center gap-1 select-none transition-colors duration-200 py-1"
        style={{ color: 'var(--sidebar-heading)' }}
        aria-expanded={open}
        aria-controls={`sidebar-${id}-items`}
        onClick={onToggle}
      >
        {title}
        <Icon name="expand_more" size={14} className={`dropdown-chevron ml-auto transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div
        ref={itemsRef}
        className="sidebar-section-items overflow-hidden transition-[max-height] duration-300 ease-in-out space-y-0.5"
        id={`sidebar-${id}-items`}
        role="region"
        aria-label={title}
      >
        {children}
      </div>
    </div>
  );
}
