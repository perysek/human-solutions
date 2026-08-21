import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/lib/icons/Icon';
import { Button } from '@/components/ui/Button';
import { SelectField, TextareaField, TextField } from '@/components/ui/form';
import { useApiData } from '@/lib/api/useApiData';
import { workersApi } from '@/lib/api/workers';
import { useFocusTrap } from '@/lib/a11y/useFocusTrap';
import { useEscapeClaim } from '@/lib/a11y/useEscapeClaim';
import { useToast } from '@/lib/feedback/ToastProvider';

export type ActionPlanStatus = 'defined' | 'in_progress' | 'completed' | 'effective';

interface StatusOption {
  value: ActionPlanStatus;
  label: string;
  color: string;
  background: string;
}

// Reuses the app's existing status-color tokens (tokens.css) where a fit
// exists (Zdefiniowane~scheduled, W trakcie~in-progress, Zakończone~completed)
// so this new status set doesn't invent a parallel blue/amber/green scheme.
// "Skuteczne" (verified effective, a step past "done") has no existing
// token — teal keeps it visually distinct from Zakończone's green rather
// than reusing/shading it, so the two are never confused at a glance.
const STATUS_OPTIONS: StatusOption[] = [
  { value: 'defined', label: 'Zdefiniowane', color: 'var(--color-status-scheduled)', background: 'var(--color-status-scheduled-bg)' },
  { value: 'in_progress', label: 'W trakcie', color: 'var(--color-status-in-progress)', background: 'var(--color-status-in-progress-bg)' },
  { value: 'completed', label: 'Zakończone', color: 'var(--color-status-completed)', background: 'var(--color-status-completed-bg)' },
  { value: 'effective', label: 'Skuteczne', color: 'var(--color-chart-teal)', background: 'rgba(20, 184, 166, 0.1)' },
];

/** Custom (non-native) listbox so each status renders as a colored item —
 * a native <select>'s <option> list can't carry per-item background/color
 * in any browser, which the "colored status-items" requirement needs. */
function StatusSelect({ value, onChange }: { value: ActionPlanStatus; onChange: (v: ActionPlanStatus) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const current = STATUS_OPTIONS.find((o) => o.value === value) ?? STATUS_OPTIONS[0];
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

  return (
    <div className="form-field" ref={wrapRef}>
      <label className="form-label" id="action-plan-status-label">
        Status
      </label>
      <button
        type="button"
        className="form-select"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby="action-plan-status-label"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="refined-badge" style={{ background: current.background, color: current.color }}>
          {current.label}
        </span>
        <Icon name="expand_more" size={14} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        // Deliberately not position:absolute (unlike ColumnFilterDropdown's
        // .col-filter-menu, which this otherwise reuses) — an absolute
        // overlay gets clipped by the modal body's own overflow-y:auto,
        // since overflow clips absolutely-positioned descendants at the
        // nearest scrolling ancestor. Flowing inline instead just grows
        // the modal body's scroll area, which is fine in a short form.
        <div role="listbox" aria-labelledby="action-plan-status-label" className="col-filter-menu" style={{ position: 'static', marginTop: '0.375rem' }}>
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              className="col-filter-item"
              style={{ width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              <span className="refined-badge" style={{ background: opt.background, color: opt.color }}>
                {opt.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export interface ActionPlanContext {
  workerId: string;
  workerName: string;
  skillDescription: string;
}

interface ActionPlanModalProps {
  context: ActionPlanContext;
  onClose: () => void;
}

/** LUK_1 "plan działania" form — opened per competency-gap row from
 * CompetencyGapsReportPage. There is no action_plans table yet (the DB
 * schema for it is a deliberately separate next step, per the task this
 * was built under), so submitting validates the form and hands the user a
 * clear "not persisted yet" toast instead of pretending to save. Swap the
 * body of handleSubmit for a real workersApi/actionPlansApi call once that
 * table + endpoint exist — the form/fields themselves need no change. */
export function ActionPlanModal({ context, onClose }: ActionPlanModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  const [description, setDescription] = useState('');
  const [responsibleId, setResponsibleId] = useState('');
  const [plannedDate, setPlannedDate] = useState('');
  const [status, setStatus] = useState<ActionPlanStatus>('defined');

  const { data: workersData } = useApiData(() => workersApi.list({ status: 'active', page_size: 500 }), []);
  const responsibleOptions = useMemo(
    () => (workersData?.workers ?? []).map((w) => ({ value: w.id, label: `${w.surname} ${w.firstname}` })),
    [workersData],
  );

  useFocusTrap(true, panelRef);
  useEscapeClaim(true);

  const canSubmit = description.trim().length > 0 && responsibleId.length > 0 && plannedDate.length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    toast.info('Plan działania przygotowany. Zapis w bazie danych zostanie podłączony w kolejnym etapie.');
    onClose();
  }

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-plan-modal-title"
        className="modal-content"
        style={{ maxWidth: '30rem' }}
      >
        <div className="modal-header">
          <h3 id="action-plan-modal-title">Plan działania</h3>
          <button type="button" className="modal-close" aria-label="Zamknij" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p className="text-sm mb-4" style={{ color: 'var(--color-ink-subtle)' }}>
              {context.workerName} · {context.skillDescription}
            </p>
            <div className="form-grid">
              <TextareaField
                label="Opis działania"
                name="description"
                required
                fullWidth
                rows={3}
                autoFocus
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <SelectField
                label="Odpowiedzialny"
                name="responsible_id"
                required
                fullWidth
                placeholder="Wybierz pracownika…"
                options={responsibleOptions}
                value={responsibleId}
                onChange={(e) => setResponsibleId(e.target.value)}
              />
              <TextField
                label="Planowana data"
                name="planned_date"
                type="date"
                required
                fullWidth
                value={plannedDate}
                onChange={(e) => setPlannedDate(e.target.value)}
              />
              <div className="form-field-full">
                <StatusSelect value={status} onChange={setStatus} />
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <Button type="button" variant="secondary" onClick={onClose}>
              Anuluj
            </Button>
            <Button type="submit" variant="primary" disabled={!canSubmit}>
              Zapisz
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
