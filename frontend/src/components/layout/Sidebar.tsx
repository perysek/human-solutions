import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth/AuthContext';
import { useFocusTrap } from '@/lib/a11y/useFocusTrap';
import { SidebarSection } from './SidebarSection';
import { NavIcon } from './NavIcon';
import { ThemeSwitcher } from './ThemeSwitcher';
import { NAV_SECTIONS } from './navConfig';

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Administrator systemu',
  hr_manager: 'Kierownik HR',
  trainer: 'Trener',
  viewer: 'Obserwator',
};

interface SidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
  toggleButtonRef: React.RefObject<HTMLButtonElement>;
}

export function Sidebar({ mobileOpen, onCloseMobile, toggleButtonRef }: SidebarProps) {
  const { user, hasModuleAccess, logout } = useAuth();
  const location = useLocation();
  const asideRef = useRef<HTMLElement>(null);

  const visibleSections = useMemo(() => {
    if (!user) return [];
    const ctx = { user, hasModuleAccess };
    return NAV_SECTIONS.map((section) => ({
      ...section,
      links: section.links.filter((link) => link.visible(ctx)),
    })).filter((section) => section.links.length > 0);
  }, [user, hasModuleAccess]);

  const activeSectionId = useMemo(
    () => visibleSections.find((s) => s.links.some((l) => location.pathname.startsWith(l.to)))?.id ?? null,
    [visibleSections, location.pathname],
  );

  const [openSectionId, setOpenSectionId] = useState<string | null>(activeSectionId);
  useEffect(() => {
    setOpenSectionId(activeSectionId);
  }, [activeSectionId]);

  // Mobile drawer: focus trap + Escape-to-close + body scroll lock.
  useFocusTrap(mobileOpen, asideRef, toggleButtonRef);
  useEffect(() => {
    if (!mobileOpen) return;
    document.body.classList.add('scroll-lock');
    const firstLink = asideRef.current?.querySelector<HTMLElement>('a[href]');
    firstLink?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        // One Esc = one layer: stop the global shortcut handler (if any) from
        // also firing and stealing the focus-return we're about to do.
        e.stopImmediatePropagation();
        onCloseMobile();
      }
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.body.classList.remove('scroll-lock');
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [mobileOpen, onCloseMobile]);

  if (!user) return null;

  return (
    <>
      <aside
        ref={asideRef}
        id="sidebar"
        className={`sidebar-drawer w-[17rem] flex-col ${mobileOpen ? 'is-open' : ''}`}
        style={{ background: 'var(--sidebar-bg)', color: 'var(--sidebar-text)', boxShadow: 'var(--shadow-sidebar)' }}
      >
        <div
          className="px-4 py-3 flex flex-col items-center gap-1"
          style={{ borderBottom: '1px solid var(--sidebar-border)' }}
        >
          {/* /logo.webp was MyWay Beauty Salon's wordmark baked into the
              image pixels (alt="" alone doesn't fix a logo whose branding
              IS the graphic, not just its alt text) — no replacement asset
              exists yet, so the text caption is the whole brand mark for
              now. Re-add an <img> here once a real logo exists. */}
          <p className="text-lg font-semibold tracking-tight text-center" style={{ color: 'var(--sidebar-text-active)' }}>
            System Kadrowy
          </p>
          <p className="text-[11px] tracking-widest uppercase text-center" style={{ color: 'var(--sidebar-text)' }}>
            Zarządzanie kadrami
          </p>
        </div>

        <nav className="sidebar-nav flex-1 px-4 py-2 overflow-y-auto" aria-label="Menu główne">
          {visibleSections.map((section) => (
            <SidebarSection
              key={section.id}
              id={section.id}
              title={section.title}
              open={openSectionId === section.id}
              onToggle={() => setOpenSectionId((cur) => (cur === section.id ? null : section.id))}
            >
              {section.links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end
                  viewTransition
                  onClick={onCloseMobile}
                  className={({ isActive }) =>
                    `sidebar-link flex items-center gap-2.5 px-4 py-[0.425rem] min-h-[44px] lg:min-h-0 text-base font-medium transition-all duration-200 group rounded-[var(--radius-sm)] ${
                      link.mobileHide ? 'nav-mobile-hide' : ''
                    } ${isActive ? 'sidebar-link--active' : 'sidebar-link--default'}`
                  }
                >
                  <NavIcon path={link.iconPath} />
                  {link.label}
                </NavLink>
              ))}
            </SidebarSection>
          ))}
        </nav>

        <div
          className="px-4 py-3 shrink-0"
          style={{ borderTop: '1px solid var(--sidebar-border)', background: 'var(--sidebar-bg-deep)' }}
        >
          <div className="flex items-center gap-2">
            <div className="avatar-gradient w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-bold shadow-lg">
              {user.fullName.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-medium truncate" style={{ color: 'var(--sidebar-text-active)' }}>
                {user.fullName}
              </p>
              <p className="text-[13px]" style={{ color: 'var(--sidebar-text)' }}>
                {ROLE_LABELS[user.role] ?? user.role}
              </p>
            </div>
            <ThemeSwitcher />
            <button
              type="button"
              className="flex items-center justify-center w-10 h-10 shrink-0 rounded-[var(--radius-sm)] border border-transparent transition-all duration-200"
              style={{ color: 'var(--sidebar-text)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#e0807f';
                e.currentTarget.style.background = 'rgba(155, 44, 44, 0.18)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--sidebar-text)';
                e.currentTarget.style.background = 'transparent';
              }}
              title="Wyloguj"
              aria-label="Wyloguj"
              onClick={logout}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      <div
        className={`sidebar-backdrop fixed inset-0 bg-black/50 z-30 lg:hidden ${mobileOpen ? 'is-open' : ''}`}
        aria-hidden="true"
        onClick={onCloseMobile}
      />
    </>
  );
}
