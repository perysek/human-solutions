import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/lib/icons/Icon';
import { Button } from '@/components/ui/Button';
import { TextField, TextareaField } from '@/components/ui/form';
import { workersApi, type TerminationDefault } from '@/lib/api/workers';
import { useFocusTrap } from '@/lib/a11y/useFocusTrap';
import { useEscapeClaim } from '@/lib/a11y/useEscapeClaim';
import { useToast } from '@/lib/feedback/ToastProvider';
import { ApiError } from '@/lib/api/client';

/** Local (not UTC) today as 'YYYY-MM-DD' — matches what a `<input type="date">`
 * stores. Duplicated per-modal (see ActionPlanModal's own copy) rather
 * than shared, matching this codebase's existing convention. */
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const NOTICE_STEP_DAYS = 5;

interface TerminationModalProps {
  workerId: string;
  workerName: string;
  onClose: () => void;
  /** Called after a successful submit so the caller (WorkerViewPage) can
   * reload the profile — the worker itself isn't inactive yet (that only
   * happens once planned_fire_date is reached), but the new pending
   * notice should show up right away. */
  onSubmitted: () => void;
}

/** "Złożenie wypowiedzenia" — the 'Dezaktywuj' button's new target.
 * Replaces the old instant soft-delete: submits a notice of termination
 * (data złożenia + przyczyna + okres wypowiedzenia) instead of setting
 * fire_date directly. The server computes the Kodeks-pracy-tier default
 * okres wypowiedzenia from the worker's tenure — this form only lets the
 * user decrease it (5-day steps, floor 0, via the down icon or the
 * ArrowDown key while the value is focused), never raise it back up. */
export function TerminationModal({ workerId, workerName, onClose, onSubmitted }: TerminationModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  const [submissionDate, setSubmissionDate] = useState(todayStr());
  const [reason, setReason] = useState('');
  const [noticeDays, setNoticeDays] = useState<number | null>(null);
  const [shorteningReason, setShorteningReason] = useState('');
  const [defaults, setDefaults] = useState<TerminationDefault | null>(null);
  const [loadingDefaults, setLoadingDefaults] = useState(true);
  const [saving, setSaving] = useState(false);

  useFocusTrap(true, panelRef);
  useEscapeClaim(true);

  // Re-fetch the tier default whenever the submission date changes (tenure
  // at that date may fall into a different tier) — and reset any manual
  // shortening, since it was relative to the old default and may no
  // longer make sense against the new one.
  useEffect(() => {
    let cancelled = false;
    setLoadingDefaults(true);
    workersApi
      .terminationDefault(workerId, submissionDate)
      .then((result) => {
        if (cancelled) return;
        setDefaults(result);
        setNoticeDays(result.default_notice_period_days);
        setShorteningReason('');
      })
      .catch(() => {
        if (!cancelled) toast.error('Nie udało się pobrać domyślnego okresu wypowiedzenia.');
      })
      .finally(() => {
        if (!cancelled) setLoadingDefaults(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId, submissionDate]);

  const defaultDays = defaults?.default_notice_period_days ?? null;
  const shortened = defaultDays != null && noticeDays != null && noticeDays < defaultDays;
  const plannedFireDate = noticeDays != null ? addDays(submissionDate, noticeDays) : null;

  function decreaseNoticeDays() {
    setNoticeDays((cur) => (cur == null ? cur : Math.max(cur - NOTICE_STEP_DAYS, 0)));
  }

  function handleStepperKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      decreaseNoticeDays();
    } else if (e.key === 'ArrowUp') {
      // Decrease-only control — the up arrow does nothing rather than
      // raising the value back toward (or past) the computed default.
      e.preventDefault();
    }
  }

  const canSubmit =
    submissionDate.length > 0 &&
    reason.trim().length > 0 &&
    noticeDays != null &&
    !loadingDefaults &&
    (!shortened || shorteningReason.trim().length > 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || saving || noticeDays == null) return;
    if (submissionDate > todayStr()) {
      toast.error('Data złożenia nie może być późniejsza niż dzisiaj');
      return;
    }
    setSaving(true);
    try {
      await workersApi.submitTermination(workerId, {
        submission_date: submissionDate,
        reason: reason.trim(),
        notice_period_days: noticeDays,
        shortening_reason: shortened ? shorteningReason.trim() : null,
      });
      toast.success('Wypowiedzenie złożone.');
      onSubmitted();
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Nie udało się złożyć wypowiedzenia.');
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div
      className="modal-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="termination-modal-title" className="modal-content" style={{ maxWidth: '32rem' }}>
        <div className="modal-header">
          <h3 id="termination-modal-title">Złożenie wypowiedzenia</h3>
          <button type="button" className="modal-close" aria-label="Zamknij" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p className="text-sm mb-4" style={{ color: 'var(--color-ink-subtle)' }}>
              {workerName}
            </p>

            <div className="form-grid">
              <TextField
                label="Data złożenia"
                name="submission_date"
                type="date"
                required
                max={todayStr()}
                value={submissionDate}
                onChange={(e) => setSubmissionDate(e.target.value)}
              />

              <div className="form-field">
                <label className="form-label" htmlFor="notice_period_days">
                  Okres wypowiedzenia (dni) <span style={{ color: 'var(--color-error)' }}>*</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="notice_period_days"
                    className="form-input"
                    style={{ width: '5rem', textAlign: 'center' }}
                    readOnly
                    value={loadingDefaults ? '…' : (noticeDays ?? 0)}
                    onKeyDown={handleStepperKeyDown}
                    aria-label="Okres wypowiedzenia w dniach — strzałka w dół lub przycisk zmniejsza o 5 dni"
                  />
                  <span className="text-sm" style={{ color: 'var(--color-ink-subtle)' }}>
                    dni
                  </span>
                  <button
                    type="button"
                    className="action-icon-btn"
                    aria-label="Zmniejsz okres wypowiedzenia o 5 dni"
                    disabled={loadingDefaults || noticeDays == null || noticeDays <= 0}
                    onClick={decreaseNoticeDays}
                  >
                    <Icon name="expand_more" size={16} />
                  </button>
                </div>
                <p className="mt-1 text-xs" style={{ color: 'var(--color-ink-subtle)' }}>
                  {loadingDefaults || defaultDays == null
                    ? 'Wczytywanie domyślnego okresu…'
                    : `Domyślnie ${defaultDays} dni (wg stażu pracy). Planowana data zwolnienia: ${plannedFireDate ? new Date(plannedFireDate).toLocaleDateString('pl-PL') : '—'}.`}
                </p>
              </div>

              {shortened && (
                <TextareaField
                  label="Przyczyna skrócenia okresu"
                  name="shortening_reason"
                  required
                  fullWidth
                  rows={2}
                  autoFocus
                  value={shorteningReason}
                  onChange={(e) => setShorteningReason(e.target.value)}
                  placeholder="Wymagane, gdy okres wypowiedzenia jest skrócony poniżej wartości domyślnej"
                />
              )}

              <TextareaField
                label="Przyczyna złożenia"
                name="reason"
                required
                fullWidth
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>
          <div className="modal-footer">
            <Button type="button" variant="secondary" onClick={onClose}>
              Anuluj
            </Button>
            <Button type="submit" variant="primary" disabled={!canSubmit || saving}>
              {saving ? 'Zapisywanie…' : 'Złóż wypowiedzenie'}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
