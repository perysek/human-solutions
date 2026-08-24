import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/lib/icons/Icon';
import { useEscapeClaim } from '@/lib/a11y/useEscapeClaim';

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
}

/** Single-select combobox with a type-to-filter search box in the popover —
 * built for the "Szkolenie" picker in ActionPlanModal (dozens of internal
 * trainings, picked by name), but generic enough for any long option list —
 * every native <select> in the app now goes through this (see form.tsx's
 * SelectField) or a direct label-less usage for compact/filter contexts.
 * Reuses ColumnFilterDropdown/StatusSelect's trigger-button + inline-popover
 * shape (not position:absolute — see StatusSelect's comment on why: an
 * absolute overlay gets clipped by the modal body's own overflow-y:auto). */
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
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const labelId = `${id}-label`;
  useEscapeClaim(open);

  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    const focusTimer = window.setTimeout(() => searchRef.current?.focus(), 0);
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

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
      {open && (
        <div
          role="listbox"
          aria-labelledby={label ? labelId : undefined}
          aria-label={!label ? (ariaLabel ?? searchPlaceholder) : undefined}
          className="col-filter-menu"
          style={{ position: 'static', marginTop: '0.375rem', display: 'flex', flexDirection: 'column', width: fullWidth ? '100%' : 'max-content' }}
        >
          <input
            ref={searchRef}
            type="text"
            className="refined-input"
            style={{ marginBottom: '0.375rem' }}
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={label ? `${searchPlaceholder} — ${label}` : (ariaLabel ? `${searchPlaceholder} — ${ariaLabel}` : searchPlaceholder)}
          />
          <div style={{ maxHeight: '12rem', overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <p style={{ padding: '0.375rem 0.5rem', fontSize: '0.8125rem', color: 'var(--color-ink-subtle)' }}>Brak wyników</p>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={opt.value === value}
                  className="col-filter-item"
                  style={{
                    width: '100%',
                    border: 'none',
                    background: opt.value === value ? 'var(--color-surface)' : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
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
        </div>
      )}
    </div>
  );
}
