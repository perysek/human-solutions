import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/lib/icons/Icon';
import { useEscapeClaim } from '@/lib/a11y/useEscapeClaim';

export interface FilterOption {
  value: string;
  label: string;
}

interface ColumnFilterDropdownProps {
  columnLabel: string;
  options: FilterOption[];
  /** Values currently shown. Equal to the full option set means "no filter active". */
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
}

interface PopoverCoords {
  left: number;
  top?: number;
  bottom?: number;
}

// Matches .col-filter-menu's own min-width (11rem) — used to clamp the
// popover's left offset before it has rendered into the portal, same as
// SearchableSelect's ESTIMATED_MENU_HEIGHT for its vertical flip. The
// button that triggers this menu is a small icon (not a full-width field
// like SearchableSelect's trigger), so clamping off the *button's* rect
// width — as SearchableSelect does — would under-correct here.
const ESTIMATED_MENU_WIDTH = 176;
const ESTIMATED_MENU_HEIGHT = 220;

/**
 * Multi-choice popover for a badge-value column header (e.g. Status) —
 * checkboxes per distinct value, filtering table rows to the checked set.
 * Deselecting everything would hide all rows, which reads as broken rather
 * than "no filter", so "Zaznacz wszystko" always restores the full set
 * instead of allowing an empty one.
 *
 * Portals the open menu to document.body and positions it with
 * position:fixed off the trigger button's own getBoundingClientRect(),
 * clamped to the viewport — same escape hatch SearchableSelect uses.
 * The filter button typically sits at the right edge of a search-card row,
 * and .col-filter-menu's default position:absolute + left:0 would anchor
 * the ~176px-wide menu off the button's left edge with nothing to keep it
 * inside the viewport, hanging most of it off-screen when the button is
 * near (or past) the right edge.
 */
export function ColumnFilterDropdown({ columnLabel, options, selected, onChange }: ColumnFilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<PopoverCoords | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isFiltered = selected.size < options.length;
  useEscapeClaim(open);

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < ESTIMATED_MENU_HEIGHT && rect.top > spaceBelow;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - ESTIMATED_MENU_WIDTH - 8));
      setCoords(
        openUp
          ? { bottom: window.innerHeight - rect.top + 6, left }
          : { top: rect.bottom + 6, left },
      );
    }
    updatePosition();

    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  function toggleValue(value: string) {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  }

  return (
    <div className="col-filter-wrap" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`col-filter-btn ${isFiltered ? 'is-active' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-haspopup="true"
        aria-expanded={open}
        title={`Filtruj: ${columnLabel}`}
        aria-label={`Filtruj kolumnę ${columnLabel}`}
      >
        <Icon name="filter_list" size={13} />
        <Icon name="expand_more" size={11} className={`dropdown-chevron transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open &&
        coords &&
        createPortal(
          <div
            ref={menuRef}
            className="col-filter-menu"
            role="menu"
            aria-label={`Filtr kolumny ${columnLabel}`}
            onClick={(e) => e.stopPropagation()}
            style={{
              // .col-filter-menu sets position:absolute/top:100% for its
              // default (non-portaled) usage in ActionPlanModal — explicit
              // 'auto' on the unused side is required, otherwise React omits
              // the undefined style and that class rule wins instead.
              position: 'fixed',
              top: coords.top ?? 'auto',
              bottom: coords.bottom ?? 'auto',
              left: coords.left,
              margin: 0,
              zIndex: 10000,
            }}
          >
            <div className="col-filter-actions">
              <button type="button" className="col-filter-action-btn" onClick={() => onChange(new Set(options.map((o) => o.value)))}>
                Zaznacz wszystko
              </button>
              <button type="button" className="col-filter-action-btn" onClick={() => onChange(new Set())}>
                Wyczyść
              </button>
            </div>
            {options.map((opt) => (
              <label key={opt.value} className="col-filter-item">
                <input type="checkbox" checked={selected.has(opt.value)} onChange={() => toggleValue(opt.value)} />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
