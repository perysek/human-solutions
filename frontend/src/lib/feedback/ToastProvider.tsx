import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/lib/icons/Icon';

type ToastType = 'success' | 'error' | 'warning' | 'info';

/** Optional secondary affordance inside a toast — e.g. TASK3's "Zobacz
 * historię zmian" link back to the org chart. Deliberately an `onClick`
 * callback, not a `to` route string: ToastProvider mounts OUTSIDE
 * <BrowserRouter> (see App.tsx), so it has no Router context of its own to
 * navigate with — the CALLER (already inside Router context, e.g.
 * DepartmentForm) builds the callback from its own useNavigate(). Rendered
 * as a <button>, not an <a>, on purpose: a same-page, JS-driven route change
 * is a button's job semantically (WAI-ARIA), not a real cross-document link. */
interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  action?: ToastAction;
}

interface ToastContextValue {
  show: (message: string, type?: ToastType, durationMs?: number, action?: ToastAction) => void;
  success: (message: string, durationMs?: number, action?: ToastAction) => void;
  error: (message: string, durationMs?: number, action?: ToastAction) => void;
  warning: (message: string, durationMs?: number, action?: ToastAction) => void;
  info: (message: string, durationMs?: number, action?: ToastAction) => void;
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

  const show = useCallback((message: string, type: ToastType = 'info', durationMs = 4000, action?: ToastAction) => {
    const id = nextId.current++;
    setToasts((cur) => {
      const next = [...cur, { id, message, type, action }];
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
      success: (m, d, a) => show(m, 'success', d, a),
      error: (m, d, a) => show(m, 'error', d, a),
      warning: (m, d, a) => show(m, 'warning', d, a),
      info: (m, d, a) => show(m, 'info', d, a),
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
            {t.action && (
              <button
                type="button"
                className="underline underline-offset-2 opacity-90 hover:opacity-100 text-sm font-medium whitespace-nowrap"
                onClick={() => {
                  t.action!.onClick();
                  setToasts((cur) => cur.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
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

// Context + companion hook colocated deliberately (see AuthContext.tsx) —
// react-refresh/only-export-components only affects HMR granularity, not
// correctness.
// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a <ToastProvider>');
  return ctx;
}
