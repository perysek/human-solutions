import { useEffect, useRef, useState } from 'react';
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

/**
 * Multi-choice popover for a badge-value column header (e.g. Status) —
 * checkboxes per distinct value, filtering table rows to the checked set.
 * Deselecting everything would hide all rows, which reads as broken rather
 * than "no filter", so "Zaznacz wszystko" always restores the full set
 * instead of allowing an empty one.
 */
export function ColumnFilterDropdown({ columnLabel, options, selected, onChange }: ColumnFilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const isFiltered = selected.size < options.length;
  useEscapeClaim(open);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
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

  function toggleValue(value: string) {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  }

  return (
    <div className="col-filter-wrap" ref={wrapRef}>
      <button
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
      </button>
      {open && (
        <div className="col-filter-menu" role="menu" aria-label={`Filtr kolumny ${columnLabel}`} onClick={(e) => e.stopPropagation()}>
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
        </div>
      )}
    </div>
  );
}
