import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/lib/icons/Icon';
import { useFocusTrap } from '@/lib/a11y/useFocusTrap';
import { useEscapeClaim } from '@/lib/a11y/useEscapeClaim';

type ConfirmType = 'danger' | 'warning' | 'info';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: ConfirmType;
}

type ConfirmContextValue = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

const TYPE_ICON: Record<ConfirmType, string> = {
  danger: 'warning',
  warning: 'warning',
  info: 'info',
};

const TYPE_TINT: Record<ConfirmType, { background: string; color: string }> = {
  danger: { background: 'rgba(155, 44, 44, 0.08)', color: 'var(--color-error)' },
  warning: { background: 'rgba(154, 103, 0, 0.08)', color: 'var(--color-warning)' },
  info: { background: 'rgba(30, 96, 145, 0.08)', color: 'var(--color-info)' },
};

/**
 * Global destructive-action confirmation dialog — the React equivalent of
 * templates/components/confirm_modal.html + static's showConfirmModal /
 * confirmDelete. The original's dual "form submit vs JS callback" API
 * collapses naturally into a promise here: `await confirm({...})` resolves
 * true/false. Visual + a11y contract (role=dialog, focus starts on Cancel,
 * Tab trap, Escape closes, 3px radius, flat cm-btn colors) is unchanged.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  const confirm = useCallback((opts: ConfirmOptions) => {
    setOptions(opts);
    requestAnimationFrame(() => setIsOpen(true));
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const close = useCallback((result: boolean) => {
    setIsOpen(false);
    resolverRef.current?.(result);
    resolverRef.current = null;
    window.setTimeout(() => setOptions(null), 200);
  }, []);

  useFocusTrap(isOpen, panelRef);
  useEscapeClaim(isOpen);

  const type = options?.type ?? 'danger';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <div
          id="confirm-modal-backdrop"
          className={isOpen ? 'is-open' : ''}
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) close(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close(false);
          }}
        >
          <div
            id="confirm-modal-panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-modal-title"
            className="p-6"
          >
            <div className="flex items-start gap-3 mb-4">
              <span className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={TYPE_TINT[type]}>
                <Icon name={TYPE_ICON[type]} size={22} />
              </span>
              <div>
                <h3 id="confirm-modal-title" className="text-base font-semibold" style={{ color: 'var(--color-ink)' }}>
                  {options.title}
                </h3>
                <p className="text-sm mt-1" style={{ color: 'var(--color-ink-muted)' }}>
                  {options.message}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button ref={cancelBtnRef} type="button" className="cm-btn cm-btn-cancel" autoFocus onClick={() => close(false)}>
                {options.cancelText ?? 'Anuluj'}
              </button>
              <button type="button" className={`cm-btn cm-btn-confirm cm-${type}`} onClick={() => close(true)}>
                {options.confirmText ?? 'Potwierdź'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

// Context + companion hook colocated deliberately (see AuthContext.tsx) —
// react-refresh/only-export-components only affects HMR granularity, not
// correctness.
// eslint-disable-next-line react-refresh/only-export-components
export function useConfirm(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within a <ConfirmProvider>');
  return ctx;
}
