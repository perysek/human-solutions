import { useRef } from 'react';
import { Icon } from '@/lib/icons/Icon';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}

/**
 * The `.search-input-wrap` markup every list page hand-rolls, in one place:
 * a text input plus the "×" clear button `.search-clear-btn` was already
 * styled for (components.css:338-358) but never rendered anywhere. Callers
 * own the raw `value`/`onChange` — debouncing the value that actually
 * drives the API call is the caller's job via `useDebouncedValue`, kept
 * separate so typing always renders instantly regardless of fetch timing.
 */
export function SearchInput({ value, onChange, placeholder, ariaLabel }: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="search-input-wrap">
      <input
        ref={inputRef}
        type="text"
        className="refined-input"
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className={`search-clear-btn ${value ? 'visible' : ''}`}
        aria-label="Wyczyść wyszukiwanie"
        tabIndex={value ? 0 : -1}
        onClick={() => {
          onChange('');
          inputRef.current?.focus();
        }}
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
