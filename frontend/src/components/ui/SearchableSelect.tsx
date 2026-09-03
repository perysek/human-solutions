import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/lib/icons/Icon';
import { useEscapeClaim } from '@/lib/a11y/useEscapeClaim';

interface PopoverCoords {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
}

export interface SearchableSelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  id: string;
  /** Visible label above the trigger (renders a .form-field block). Omit for
   * a label-less usage (compact table-cell selects, filter-bar/pagination
   * pickers) — pass `ariaLabel` instead so it's still announced, or rely on
   * an external <label htmlFor={id}> (the trigger button carries `id`). */
  label?: string;
  /** Accessible name when `label` is omitted. Ignored if `label` is set. */
  ariaLabel?: string;
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  required?: boolean;
  disabled?: boolean;
  /** Default true: block, 100%-width (matches .form-select). false: shrinks
   * to content, inline-block — for compact filter-bar/pagination pickers
   * sitting next to other controls in a flex row. */
  fullWidth?: boolean;
  /** Trigger button class — default 'form-select'. Pass 'refined-select' for
   * the search-card/table-footer compact filter look. */
  triggerClassName?: string;
  /** Extra inline style merged onto the trigger button — e.g. the smaller
   * padding/font-size table-cell selects use. */
  triggerStyle?: React.CSSProperties;
  /** Task 2 (Pulpit's orphan-jobs alert -> JobForm's "Dział" field) — opens
   * the popover (and focuses its search box, via the same effect the
   * trigger's own onClick already runs) once, on mount, without the user
   * needing to click the trigger first. A one-shot flag: toggling it back
   * to false does not close an already-open popover — same asymmetry as
   * `autoFocus` on a plain <input>. */
  autoOpen?: boolean;
}

/** Single-select combobox with a type-to-filter search box in the popover —
 * built for the "Szkolenie" picker in ActionPlanModal (dozens of internal
 * trainings, picked by name), but generic enough for any long option list —
 * every native <select> in the app now goes through this (see form.tsx's
 * SelectField) or a direct label-less usage for compact/filter contexts.
 * Reuses ColumnFilterDropdown/StatusSelect's trigger-button + popover shape,
 * but portals the open listbox to document.body and positions it with
 * position:fixed off the trigger's own getBoundingClientRect(). That's what
 * lets it float over a table row instead of pushing the row (and its
 * siblings, since <td> heights are shared across a <tr>) taller to fit the
 * option list — StatusSelect's static-flow approach avoids clipping inside
 * a modal's overflow-y:auto but only reads as "correct" for a short form,
 * not a table cell. Fixed positioning escapes any scrolling/overflow
 * ancestor (modal body included) without the clipping absolute positioning
 * would otherwise hit. */
export function SearchableSelect({
  id,
  label,
  ariaLabel,
  options,
  value,
  onChange,
  placeholder = 'Wybierz…',
  searchPlaceholder = 'Szukaj…',
  required,
  disabled,
  fullWidth = true,
  triggerClassName = 'form-select',
  triggerStyle,
  autoOpen,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [coords, setCoords] = useState<PopoverCoords | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const labelId = `${id}-label`;
  useEscapeClaim(open);

  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    const focusTimer = window.setTimeout(() => searchRef.current?.focus(), 0);

    // Estimate rather than measure the popover's own height: it hasn't
    // rendered into the portal yet on this same pass, and re-measuring
    // after render would flash it in the wrong spot for one frame.
    const ESTIMATED_MENU_HEIGHT = 260;
    function updatePosition() {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < ESTIMATED_MENU_HEIGHT && rect.top > spaceBelow;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8));
      setCoords(
        openUp
          ? { bottom: window.innerHeight - rect.top + 6, left, width: rect.width }
          : { top: rect.bottom + 6, left, width: rect.width },
      );
    }
    updatePosition();

    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    // capture:true so scrolling inside any ancestor (a scrollable table
    // wrapper, a modal body) also repositions the popover — scroll events
    // don't bubble, but capture-phase listeners on window still see them.
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // Arrow-key navigation over the filtered option list — the popover
  // already used role="listbox"/role="option" (implying this per ARIA
  // authoring practices) but only had onClick handlers until now.
  const [activeIndex, setActiveIndex] = useState(0);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Reset to the top whenever the visible option set changes (query typed,
  // or the popover just opened onto a fresh `options` list) — otherwise
  // activeIndex could point past the end of a newly-shorter filtered list.
  useEffect(() => {
    setActiveIndex(0);
  }, [filtered]);

  useEffect(() => {
    optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  return (
    <div
      className={label ? 'form-field' : undefined}
      style={!fullWidth ? { display: 'inline-block', width: 'auto' } : undefined}
      ref={wrapRef}
    >
      {label && (
        <label className="form-label" id={labelId}>
          {label}
          {required && (
            <span style={{ color: 'var(--color-error)' }} aria-hidden="true">
              {' '}
              *
            </span>
          )}
        </label>
      )}
      <button
        ref={buttonRef}
        type="button"
        id={id}
        className={triggerClassName}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
          width: fullWidth ? '100%' : 'auto',
          cursor: disabled ? 'default' : 'pointer',
          ...triggerStyle,
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={label ? labelId : undefined}
        aria-label={!label ? ariaLabel : undefined}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span
          style={{
            color: current ? 'var(--color-ink)' : 'var(--color-ink-subtle)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textAlign: 'left',
          }}
        >
          {current?.label ?? placeholder}
        </span>
        <Icon name="expand_more" size={14} style={{ flexShrink: 0 }} />
      </button>
      {open &&
        coords &&
        createPortal(
          <div
            ref={popoverRef}
            role="listbox"
            aria-labelledby={label ? labelId : undefined}
            aria-label={!label ? (ariaLabel ?? searchPlaceholder) : undefined}
            className="col-filter-menu"
            style={{
              // .col-filter-menu sets top:100% for its default (non-portaled)
              // absolute usage — an explicit 'auto' is required on whichever
              // side is unused here, otherwise React omits the undefined
              // style and that class rule wins instead.
              position: 'fixed',
              top: coords.top ?? 'auto',
              bottom: coords.bottom ?? 'auto',
              left: coords.left,
              margin: 0,
              zIndex: 10000,
              display: 'flex',
              flexDirection: 'column',
              width: fullWidth ? coords.width : 'max-content',
            }}
          >
            <input
              ref={searchRef}
              type="text"
              className="refined-input"
              style={{ marginBottom: '0.375rem' }}
              placeholder={searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActiveIndex((i) => Math.max(i - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  const opt = filtered[activeIndex];
                  if (opt) {
                    onChange(opt.value);
                    setOpen(false);
                  }
                }
                // Escape already closes the popover via the document-level
                // listener above — nothing to do here.
              }}
              aria-label={label ? `${searchPlaceholder} — ${label}` : (ariaLabel ? `${searchPlaceholder} — ${ariaLabel}` : searchPlaceholder)}
              aria-activedescendant={filtered[activeIndex] ? `${id}-option-${activeIndex}` : undefined}
            />
            <div style={{ maxHeight: '12rem', overflowY: 'auto' }}>
              {filtered.length === 0 ? (
                <p style={{ padding: '0.375rem 0.5rem', fontSize: '0.8125rem', color: 'var(--color-ink-subtle)' }}>Brak wyników</p>
              ) : (
                filtered.map((opt, i) => (
                  <button
                    key={opt.value}
                    id={`${id}-option-${i}`}
                    ref={(el) => {
                      optionRefs.current[i] = el;
                    }}
                    type="button"
                    role="option"
                    aria-selected={opt.value === value}
                    className="col-filter-item"
                    style={{
                      width: '100%',
                      border: 'none',
                      background: i === activeIndex || opt.value === value ? 'var(--color-surface)' : 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                  >
                    {opt.label}
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
