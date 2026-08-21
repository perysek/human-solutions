import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/lib/icons/Icon';
import { Button } from '@/components/ui/Button';
import { CheckboxField, SelectField, TextareaField, TextField } from '@/components/ui/form';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { useApiData } from '@/lib/api/useApiData';
import { workersApi } from '@/lib/api/workers';
import { trainingsApi } from '@/lib/api/trainings';
import { actionPlansApi, type ActionPlanStatus } from '@/lib/api/actionPlans';
import { ACTION_PLAN_STATUS_OPTIONS } from '@/lib/actionPlanStatus';
import { useFocusTrap } from '@/lib/a11y/useFocusTrap';
import { useEscapeClaim } from '@/lib/a11y/useEscapeClaim';
import { useToast } from '@/lib/feedback/ToastProvider';

const EXPECTED_INCREASE_OPTIONS = [1, 2, 3].map((n) => ({ value: String(n), label: String(n) }));

/** Custom (non-native) listbox so each status renders as a colored item —
 * a native <select>'s <option> list can't carry per-item background/color
 * in any browser, which the "colored status-items" requirement needs. */
function StatusSelect({ value, onChange }: { value: ActionPlanStatus; onChange: (v: ActionPlanStatus) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const current = ACTION_PLAN_STATUS_OPTIONS.find((o) => o.value === value) ?? ACTION_PLAN_STATUS_OPTIONS[0];
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
          {ACTION_PLAN_STATUS_OPTIONS.map((opt) => (
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

/** What the modal needs to render + submit, for either mode:
 * - create (no `id`): opened from a competency-gap row (CompetencyGapsReportPage)
 *   — worker/skill are fixed context, only description/responsible/planned
 *   date/status are collected.
 * - edit (`id` set): opened from the tracking page (ActionPlansPage) on an
 *   existing plan — same fields plus completed/effectiveness dates, all
 *   pre-filled from the row being edited. */
export interface ActionPlanSeed {
  id?: number;
  workerId: string;
  workerName: string;
  skillId: string;
  skillDescription: string;
  description?: string;
  responsibleId?: string;
  plannedDate?: string;
  status?: ActionPlanStatus;
  completedDate?: string | null;
  effectivenessDate?: string | null;
  /** Set when editing a plan raised through the "Szkolenie" checkbox — the
   * edit form shows this as read-only context instead of the checkbox
   * (which only makes sense at creation, since the training enrollment it
   * created is a done deal by the time there's an id to edit). */
  isTraining?: boolean;
  trainingDescription?: string | null;
  expectedIncrease?: number | null;
}

interface ActionPlanModalProps {
  seed: ActionPlanSeed;
  onClose: () => void;
  /** Called after a successful create/update so the caller can reload its list. */
  onSaved: () => void;
}

/** LUK_1/LUK_2 "plan działania" form — creates a corrective action against
 * a competency gap, or edits an existing one (description, responsible,
 * dates, status). Every save round-trips through action_plans; per-field
 * changes land in audit_log via ActionPlanRepository.update() (LUK_2's
 * "full history" requirement) — see routes/workers/routes.py's
 * api_update_action_plan and the history panel on ActionPlansPage. */
export function ActionPlanModal({ seed, onClose, onSaved }: ActionPlanModalProps) {
  const isEdit = seed.id != null;
  const panelRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  const [description, setDescription] = useState(seed.description ?? '');
  const [responsibleId, setResponsibleId] = useState(seed.responsibleId ?? '');
  const [plannedDate, setPlannedDate] = useState(seed.plannedDate ?? '');
  const [status, setStatus] = useState<ActionPlanStatus>(seed.status ?? 'defined');
  const [completedDate, setCompletedDate] = useState(seed.completedDate ?? '');
  const [effectivenessDate, setEffectivenessDate] = useState(seed.effectivenessDate ?? '');
  const [isTraining, setIsTraining] = useState(false);
  const [trainingId, setTrainingId] = useState('');
  const [trainingStartDate, setTrainingStartDate] = useState('');
  const [expectedIncrease, setExpectedIncrease] = useState(1);
  const [saving, setSaving] = useState(false);

  const { data: workersData } = useApiData(() => workersApi.list({ status: 'active', page_size: 500 }), []);
  const responsibleOptions = useMemo(
    () => (workersData?.workers ?? []).map((w) => ({ value: w.id, label: `${w.surname} ${w.firstname}` })),
    [workersData],
  );

  // Only fetched for the create-mode "Szkolenie" picker, but cheap enough
  // (page_size 200 — same ceiling api_list (trainings) enforces) to always
  // load rather than gate behind isTraining, matching workersData above.
  // Scoped to seed.skillId — only trainings already linked (training_skills)
  // to the gap's own skill are offered, so a training-linked plan can't
  // point at a training unrelated to the gap it's meant to close.
  const { data: trainingsData } = useApiData(
    () => trainingsApi.list({ page_size: 200, sort: 'training_date', order: 'desc', skill_id: seed.skillId }),
    [seed.skillId],
  );
  const trainingOptions = useMemo(
    () =>
      (trainingsData?.trainings ?? []).map((t) => ({
        value: String(t.id),
        label: t.training_date ? `${t.description} — ${new Date(t.training_date).toLocaleDateString('pl-PL')}` : t.description,
      })),
    [trainingsData],
  );

  function handleTrainingSelect(value: string) {
    setTrainingId(value);
    // Suggest the training's own date as a starting point — the user can
    // still override it (e.g. the worker joins a later run of the same
    // training), so only prefill when nothing's been chosen yet.
    if (!trainingStartDate) {
      const picked = trainingsData?.trainings.find((t) => String(t.id) === value);
      if (picked?.training_date) setTrainingStartDate(picked.training_date);
    }
  }

  useFocusTrap(true, panelRef);
  useEscapeClaim(true);

  const canSubmit = isTraining
    ? trainingId.length > 0 && trainingStartDate.length > 0
    : description.trim().length > 0 && responsibleId.length > 0 && plannedDate.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || saving) return;
    setSaving(true);
    try {
      if (isEdit && seed.id != null) {
        await actionPlansApi.update(seed.id, {
          description: description.trim(),
          responsible_id: responsibleId,
          planned_date: plannedDate,
          status,
          completed_date: completedDate || null,
          effectiveness_date: effectivenessDate || null,
        });
        toast.success('Plan działania zaktualizowany.');
      } else if (isTraining) {
        await actionPlansApi.create({
          worker_id: seed.workerId,
          skill_id: seed.skillId,
          is_training: true,
          training_id: Number(trainingId),
          expected_increase: expectedIncrease,
          training_start_date: trainingStartDate,
        });
        toast.success('Plan szkoleniowy utworzony — pracownik zapisany na szkolenie.');
      } else {
        await actionPlansApi.create({
          worker_id: seed.workerId,
          skill_id: seed.skillId,
          description: description.trim(),
          responsible_id: responsibleId,
          planned_date: plannedDate,
          status,
        });
        toast.success('Plan działania utworzony.');
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się zapisać planu działania.');
    } finally {
      setSaving(false);
    }
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
          <h3 id="action-plan-modal-title">{isEdit ? 'Edytuj plan działania' : 'Plan działania'}</h3>
          <button type="button" className="modal-close" aria-label="Zamknij" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p className="text-sm mb-4" style={{ color: 'var(--color-ink-subtle)' }}>
              {seed.workerName} · {seed.skillDescription}
            </p>

            {isEdit && seed.isTraining && (
              <p className="text-sm mb-4" style={{ color: 'var(--color-ink-subtle)' }}>
                Plan szkoleniowy — {seed.trainingDescription ?? 'szkolenie usunięte'} · oczekiwany wzrost oceny: {seed.expectedIncrease}
              </p>
            )}

            {!isEdit && (
              <div className="mb-4">
                <CheckboxField
                  name="is_training"
                  label="Szkolenie"
                  description="Zamiast opisu działania: wybierz szkolenie wewnętrzne — pracownik zostanie automatycznie zapisany jako uczestnik."
                  checked={isTraining}
                  onChange={(e) => setIsTraining(e.target.checked)}
                />
              </div>
            )}

            {!isEdit && isTraining ? (
              <div className="form-grid">
                <div className="form-field-full">
                  <SearchableSelect
                    id="action-plan-training"
                    label="Szkolenie"
                    required
                    options={trainingOptions}
                    value={trainingId}
                    onChange={handleTrainingSelect}
                    placeholder="Wybierz szkolenie…"
                    searchPlaceholder="Szukaj szkolenia…"
                  />
                </div>
                <TextField
                  label="Planowana data szkolenia"
                  name="training_start_date"
                  type="date"
                  required
                  fullWidth
                  value={trainingStartDate}
                  onChange={(e) => setTrainingStartDate(e.target.value)}
                  helper="Data rozpoczęcia zapisu pracownika na to szkolenie."
                />
                <SelectField
                  label="Oczekiwany wzrost"
                  name="expected_increase"
                  required
                  options={EXPECTED_INCREASE_OPTIONS}
                  value={String(expectedIncrease)}
                  onChange={(e) => setExpectedIncrease(Number(e.target.value))}
                />
              </div>
            ) : (
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
                  fullWidth={!isEdit}
                  value={plannedDate}
                  onChange={(e) => setPlannedDate(e.target.value)}
                />
                {isEdit && (
                  <>
                    <TextField
                      label="Data zakończenia"
                      name="completed_date"
                      type="date"
                      value={completedDate}
                      onChange={(e) => setCompletedDate(e.target.value)}
                    />
                    <TextField
                      label="Data oceny skuteczności"
                      name="effectiveness_date"
                      type="date"
                      fullWidth
                      value={effectivenessDate}
                      onChange={(e) => setEffectivenessDate(e.target.value)}
                    />
                  </>
                )}
                <div className="form-field-full">
                  <StatusSelect value={status} onChange={setStatus} />
                </div>
              </div>
            )}
          </div>
          <div className="modal-footer">
            <Button type="button" variant="secondary" onClick={onClose}>
              Anuluj
            </Button>
            <Button type="submit" variant="primary" disabled={!canSubmit || saving}>
              {saving ? 'Zapisywanie…' : 'Zapisz'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
