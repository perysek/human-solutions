import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';

/** Mirrors config/page_titles.py PAGE_TITLES, trimmed to this app's routes. */
const PAGE_TITLES: [prefix: string, title: string][] = [
  ['/employees/formy-zatrudnienia', 'Formy zatrudnienia'],
  ['/employees/hierarchy', 'Hierarchia pracowników'],
  ['/employees', 'Pracownicy'],
  ['/jobs', 'Stanowiska'],
  ['/skills', 'Umiejętności'],
  ['/users', 'Użytkownicy'],
  ['/roles', 'Role'],
  ['/profile', 'Profil'],
];

function pageTitleFor(pathname: string): string {
  return PAGE_TITLES.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? '';
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const isFirstRender = useRef(true);
  const location = useLocation();

  // SPA route-change focus management: a client-side navigation never fires
  // a browser "page load", so screen readers get no signal anything
  // happened unless focus visibly moves. Moving it to the main landmark on
  // every navigation (skipping the very first mount, where the browser's
  // own initial-focus behavior is already correct) is the standard fix —
  // same pattern React Router's own accessibility guidance recommends.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    mainRef.current?.focus();
  }, [location.pathname]);

  return (
    <div className="flex h-full">
      <Sidebar
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        toggleButtonRef={toggleButtonRef}
      />

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="flex items-center gap-4 px-4 py-2 lg:py-0">
          <button
            ref={toggleButtonRef}
            type="button"
            className="lg:hidden p-2 rounded-lg transition-colors"
            style={{ color: 'var(--color-ink-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            aria-label="Otwórz menu"
            aria-expanded={mobileOpen}
            aria-controls="sidebar"
            onClick={() => setMobileOpen((v) => !v)}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="lg:hidden flex items-center gap-2 min-w-0">
            {/* logo-inline.webp was MyWay Beauty Salon's wordmark (same issue
                as Sidebar.tsx's brand header — see its comment) — no
                replacement asset exists yet, so the condensed mobile header
                is text-only for now. */}
            <span className="truncate text-sm font-semibold" style={{ color: 'var(--color-ink)' }}>
              {pageTitleFor(location.pathname)}
            </span>
          </div>
          <div className="flex-1 flex items-center justify-end gap-4" />
        </header>

        {/* overflow-hidden: main is a fixed-height viewport frame. Individual
            pages own their scrolling (.refined-page scrolls itself if tall;
            list pages instead let their table-shell's row area scroll,
            keeping the page header/search bar fixed in view). */}
        <main ref={mainRef} className="flex-1 min-h-0 overflow-hidden p-0" id="main-content" tabIndex={-1} style={{ outline: 'none' }}>
          <Outlet />
        </main>

        <footer
          className="px-6 py-3 text-center text-xs"
          style={{
            background: 'var(--color-surface-warm)',
            borderTop: '1px solid var(--color-border)',
            color: 'var(--color-ink-subtle)',
          }}
        >
          &copy; {new Date().getFullYear()} System Kadrowy. Wszelkie prawa zastrzeżone.
        </footer>
      </div>
    </div>
  );
}
