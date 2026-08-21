import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/lib/icons/Icon';
import { useEscapeClaim } from '@/lib/a11y/useEscapeClaim';

export interface SearchableSelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  id: string;
  label: string;
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  required?: boolean;
  disabled?: boolean;
}

/** Single-select combobox with a type-to-filter search box in the popover —
 * built for the "Szkolenie" picker in ActionPlanModal (dozens of internal
 * trainings, picked by name), but generic enough for any long option list.
 * Reuses ColumnFilterDropdown/StatusSelect's trigger-button + inline-popover
 * shape (not position:absolute — see StatusSelect's comment on why: an
 * absolute overlay gets clipped by the modal body's own overflow-y:auto). */
export function SearchableSelect({
  id,
  label,
  options,
  value,
  onChange,
  placeholder = 'Wybierz…',
  searchPlaceholder = 'Szukaj…',
  required,
  disabled,
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
    <div className="form-field" ref={wrapRef}>
      <label className="form-label" id={labelId}>
        {label}
        {required && (
          <span style={{ color: 'var(--color-error)' }} aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      <button
        type="button"
        className="form-select"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', cursor: disabled ? 'default' : 'pointer' }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={labelId}
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
          aria-labelledby={labelId}
          className="col-filter-menu"
          style={{ position: 'static', marginTop: '0.375rem', display: 'flex', flexDirection: 'column', width: '100%' }}
        >
          <input
            ref={searchRef}
            type="text"
            className="refined-input"
            style={{ marginBottom: '0.375rem' }}
            placeholder={searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={`${searchPlaceholder} — ${label}`}
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
