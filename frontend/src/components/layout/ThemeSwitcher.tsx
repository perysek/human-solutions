import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/lib/icons/Icon';
import { useEscapeClaim } from '@/lib/a11y/useEscapeClaim';

type ThemeValue = '' | 'blue' | 'green' | 'graphite';

const THEMES: { value: ThemeValue; label: string; swatch: string }[] = [
  { value: '', label: 'Jasny', swatch: 'light' },
  { value: 'blue', label: 'Niebieski', swatch: 'blue' },
  { value: 'green', label: 'Zielony', swatch: 'green' },
  { value: 'graphite', label: 'Grafitowy', swatch: 'graphite' },
];

function applyTheme(value: ThemeValue) {
  if (value) {
    document.documentElement.setAttribute('data-theme', value);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  try {
    if (value) window.localStorage.setItem('theme', value);
    else window.localStorage.removeItem('theme');
  } catch {
    /* localStorage unavailable — theme just won't persist across reloads */
  }
}

function readInitialTheme(): ThemeValue {
  try {
    const stored = window.localStorage.getItem('theme');
    if (stored === 'blue' || stored === 'green' || stored === 'graphite') return stored;
  } catch {
    /* noop */
  }
  return '';
}

/**
 * Sidebar-footer theme switcher popover — 4 named light-family themes,
 * persisted client-side (device preference, no account sync), matching
 * STYLESEED.md's "one icon-button theme switcher … accessible popover menu
 * (role=menu)" signature move.
 */
export function ThemeSwitcher() {
  const [theme, setTheme] = useState<ThemeValue>(() => readInitialTheme());
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useEscapeClaim(open);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  function choose(value: ThemeValue) {
    setTheme(value);
    applyTheme(value);
    setOpen(false);
  }

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        type="button"
        className="relative flex items-center justify-center w-10 h-10 shrink-0 rounded-[var(--radius-sm)] border border-transparent transition-all duration-200"
        style={{ color: 'var(--sidebar-text)' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--sidebar-text-hover)';
          e.currentTarget.style.background = 'var(--sidebar-hover-bg)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--sidebar-text)';
          e.currentTarget.style.background = 'transparent';
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="theme-menu"
        title="Zmień motyw kolorystyczny"
        aria-label="Zmień motyw kolorystyczny"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="palette" className="w-5 h-5 shrink-0" />
        <Icon
          name="expand_more"
          size={12}
          className={`dropdown-chevron absolute bottom-0.5 right-0.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div id="theme-menu" className={`theme-menu ${open ? '' : 'hidden'}`} role="menu" aria-label="Motyw kolorystyczny">
        {THEMES.map((t) => (
          <button
            key={t.swatch}
            type="button"
            className="theme-menu-item"
            role="menuitemradio"
            aria-checked={theme === t.value}
            onClick={() => choose(t.value)}
          >
            <span className="theme-swatch" data-swatch={t.swatch} aria-hidden="true" />
            <span className="flex-1 text-left">{t.label}</span>
            <Icon name="check" className="theme-menu-check w-4 h-4 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}
