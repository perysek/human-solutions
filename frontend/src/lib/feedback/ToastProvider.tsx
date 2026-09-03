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
  /** Original requested duration — 0 means persistent (no auto-dismiss
   * timer ever existed for it), which hover/focus pause must respect: a
   * persistent toast getting a timer scheduled on mouseleave would start
   * auto-dismissing something the caller asked to keep on screen. */
  durationMs: number;
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

// Grace period restarted on mouseleave/blur after a hover/focus pause —
// deliberately shorter than a typical full duration (4000ms default) so a
// toast the user was just reading doesn't immediately vanish the instant
// they look away, but also doesn't linger as long as a fresh toast would.
const RESUME_DISMISS_MS = 2000;

/**
 * Runtime toast notifications — React equivalent of static/js/notifications.js
 * Notifications.*. Same contract: 4 types, max 3 stacked (oldest dropped
 * first), 0 duration = persistent until dismissed.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  // Keyed by toast id, not stored on the Toast object itself — a timer
  // being rescheduled (pause/resume) shouldn't trigger a re-render on its
  // own, only the eventual dismiss should.
  const timeoutIds = useRef<Map<number, number>>(new Map());

  const dismiss = useCallback((id: number) => {
    timeoutIds.current.delete(id);
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const scheduleDismiss = useCallback(
    (id: number, ms: number) => {
      const existing = timeoutIds.current.get(id);
      if (existing) window.clearTimeout(existing);
      timeoutIds.current.set(
        id,
        window.setTimeout(() => dismiss(id), ms),
      );
    },
    [dismiss],
  );

  /** Hover/hover-out and focus/blur both funnel through these two —
   * pauseDismiss clears whatever timer is pending (a no-op if the toast is
   * persistent, since it never had one); resumeDismiss only reschedules for
   * toasts that actually had a timer to begin with. */
  const pauseDismiss = useCallback((id: number) => {
    const existing = timeoutIds.current.get(id);
    if (existing) {
      window.clearTimeout(existing);
      timeoutIds.current.delete(id);
    }
  }, []);

  const resumeDismiss = useCallback(
    (id: number, durationMs: number) => {
      if (durationMs > 0) scheduleDismiss(id, RESUME_DISMISS_MS);
    },
    [scheduleDismiss],
  );

  const show = useCallback(
    (message: string, type: ToastType = 'info', durationMs = 4000, action?: ToastAction) => {
      const id = nextId.current++;
      setToasts((cur) => {
        const next = [...cur, { id, message, type, action, durationMs }];
        return next.length > MAX_STACKED ? next.slice(next.length - MAX_STACKED) : next;
      });
      if (durationMs > 0) scheduleDismiss(id, durationMs);
    },
    [scheduleDismiss],
  );

  const clear = useCallback(() => {
    timeoutIds.current.forEach((id) => window.clearTimeout(id));
    timeoutIds.current.clear();
    setToasts([]);
  }, []);

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
          <div
            key={t.id}
            className={`toast-${t.type}`}
            role="status"
            onMouseEnter={() => pauseDismiss(t.id)}
            onMouseLeave={() => resumeDismiss(t.id, t.durationMs)}
            onFocus={() => pauseDismiss(t.id)}
            onBlur={() => resumeDismiss(t.id, t.durationMs)}
          >
            <Icon name={TOAST_ICON[t.type]} className="icon text-lg" />
            <p className="text-sm font-medium flex-1">{t.message}</p>
            {t.action && (
              <button
                type="button"
                className="underline underline-offset-2 opacity-90 hover:opacity-100 text-sm font-medium whitespace-nowrap"
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label="Zamknij powiadomienie"
              className="opacity-60 hover:opacity-100"
              onClick={() => dismiss(t.id)}
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
