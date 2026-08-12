import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/lib/icons/Icon';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  show: (message: string, type?: ToastType, durationMs?: number) => void;
  success: (message: string, durationMs?: number) => void;
  error: (message: string, durationMs?: number) => void;
  warning: (message: string, durationMs?: number) => void;
  info: (message: string, durationMs?: number) => void;
  clear: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_ICON: Record<ToastType, string> = {
  success: 'check_circle',
  error: 'cancel',
  warning: 'warning',
  info: 'info',
};

const MAX_STACKED = 3;

/**
 * Runtime toast notifications — React equivalent of static/js/notifications.js
 * Notifications.*. Same contract: 4 types, max 3 stacked (oldest dropped
 * first), 0 duration = persistent until dismissed.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const show = useCallback((message: string, type: ToastType = 'info', durationMs = 4000) => {
    const id = nextId.current++;
    setToasts((cur) => {
      const next = [...cur, { id, message, type }];
      return next.length > MAX_STACKED ? next.slice(next.length - MAX_STACKED) : next;
    });
    if (durationMs > 0) {
      window.setTimeout(() => {
        setToasts((cur) => cur.filter((t) => t.id !== id));
      }, durationMs);
    }
  }, []);

  const clear = useCallback(() => setToasts([]), []);

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      success: (m, d) => show(m, 'success', d),
      error: (m, d) => show(m, 'error', d),
      warning: (m, d) => show(m, 'warning', d),
      info: (m, d) => show(m, 'info', d),
      clear,
    }),
    [show, clear],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 space-y-2 z-50" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast-${t.type}`} role="status">
            <Icon name={TOAST_ICON[t.type]} className="icon text-lg" />
            <p className="text-sm font-medium flex-1">{t.message}</p>
            <button
              type="button"
              aria-label="Zamknij powiadomienie"
              className="opacity-60 hover:opacity-100"
              onClick={() => setToasts((cur) => cur.filter((x) => x.id !== t.id))}
            >
              <Icon name="close" className="icon text-base" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a <ToastProvider>');
  return ctx;
}
