import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/lib/icons/Icon';
import { Button } from '@/components/ui/Button';
import { CheckboxField, SelectField, TextareaField, TextField } from '@/components/ui/form';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { CreateTrainingModal } from '@/components/trainings/CreateTrainingModal';
import { useApiData } from '@/lib/api/useApiData';
import { workersApi } from '@/lib/api/workers';
import { trainingsApi } from '@/lib/api/trainings';
import { actionPlansApi, type ActionPlanStatus } from '@/lib/api/actionPlans';
import { ACTION_PLAN_STATUS_OPTIONS } from '@/lib/actionPlanStatus';
import { useFocusTrap } from '@/lib/a11y/useFocusTrap';
import { useEscapeClaim } from '@/lib/a11y/useEscapeClaim';
import { useToast } from '@/lib/feedback/ToastProvider';

const EXPECTED_INCREASE_OPTIONS = [1, 2, 3].map((n) => ({ value: String(n), label: String(n) }));

/** Local (not UTC) today as 'YYYY-MM-DD' — matches what a `<input type="date">`
 * stores, so it can be compared/assigned directly against form state. */
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Custom (non-native) listbox so each status renders as a colored item —
 * a native <select>'s <option> list can't carry per-item background/color
 * in any browser, which the "colored status-items" requirement needs. */
function StatusSelect({ value, onChange }: { value: ActionPlanStatus; onChange: (v: ActionPlanStatus) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const current = ACTION_PLAN_STATUS_OPTIONS.find((o) => o.value === value) ?? ACTION_PLAN_STATUS_OPTIONS[0];
  const filtered = ACTION_PLAN_STATUS_OPTIONS.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()));
  useEscapeClaim(open);

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
        <div
          role="listbox"
          aria-labelledby="action-plan-status-label"
          className="col-filter-menu"
          style={{ position: 'static', marginTop: '0.375rem', display: 'flex', flexDirection: 'column', width: '100%' }}
        >
          <input
            ref={searchRef}
            type="text"
            className="refined-input"
            style={{ marginBottom: '0.375rem' }}
            placeholder="Szukaj…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Szukaj — Status"
          />
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
            ))
          )}
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
  /** ISO date-time the plan was first created — only set in edit mode, used
   * to validate "Data zakończenia" can't predate the plan's own creation. */
  createdAt?: string | null;
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
  const [showCreateTraining, setShowCreateTraining] = useState(false);

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
  const { data: trainingsData, reload: reloadTrainings } = useApiData(
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

  /** "+ Nowe" flow: the created training starts with no skill links, so it
   * wouldn't show up in `trainingOptions` (scoped to seed.skillId — see the
   * comment on trainingsData above) — link it to the gap's own skill first,
   * then reload so the picker's option list includes it before selecting. */
  async function handleTrainingCreated(id: number) {
    setShowCreateTraining(false);
    try {
      await trainingsApi.setSkillLinks(id, [seed.skillId]);
      const created = await trainingsApi.get(id);
      reloadTrainings();
      setTrainingId(String(id));
      if (!trainingStartDate && created.training_date) setTrainingStartDate(created.training_date);
      toast.success('Szkolenie utworzone i wybrane.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Szkolenie utworzone, ale nie udało się go powiązać z umiejętnością.');
    }
  }

  useFocusTrap(true, panelRef);
  useEscapeClaim(true);

  // Status <-> date auto-sync (edit mode only — completed/effectiveness
  // dates only exist in that form). Forward-only: setting the status bumps
  // the matching date to today if blank, and filling a date bumps the
  // status forward if it hasn't reached that stage yet. Neither direction
  // ever reverts a value the user already set.
  function handleStatusChange(next: ActionPlanStatus) {
    setStatus(next);
    if (next === 'completed' && !completedDate) setCompletedDate(todayStr());
    if (next === 'effective' && !effectivenessDate) setEffectivenessDate(todayStr());
  }

  function handleCompletedDateChange(value: string) {
    setCompletedDate(value);
    if (value && (status === 'defined' || status === 'in_progress')) setStatus('completed');
  }

  function handleEffectivenessDateChange(value: string) {
    setEffectivenessDate(value);
    if (value && status !== 'effective') setStatus('effective');
  }

  const canSubmit = isTraining
    ? trainingId.length > 0 && trainingStartDate.length > 0
    : description.trim().length > 0 && responsibleId.length > 0 && plannedDate.length > 0;

  /** Business-rule date checks (server re-validates the same rules — this
   * is just fast feedback). Returns an error message, or null if valid. */
  function validateDates(): string | null {
    if (isTraining && !isEdit) {
      if (trainingStartDate && trainingStartDate < todayStr()) {
        return 'Planowana data szkolenia nie może być wcześniejsza niż dzisiaj';
      }
      return null;
    }
    // Training-linked plan, edit mode: dates/status aren't rendered (owned
    // by the training's own record — see the form-grid branch above), so
    // there's nothing here for the user to have gotten wrong.
    if (isEdit && seed.isTraining) return null;

    // Only enforced when the value differs from what the plan already had —
    // an existing plan may legitimately already be planned in the past
    // (still "w trakcie" from last week); editing an unrelated field on it
    // shouldn't be blocked by a date nobody touched.
    if (plannedDate && plannedDate !== (seed.plannedDate ?? '') && plannedDate < todayStr()) {
      return 'Planowana data nie może być wcześniejsza niż dzisiaj';
    }
    if (isEdit) {
      if (completedDate && completedDate > todayStr()) {
        return 'Data zakończenia nie może być późniejsza niż dzisiaj';
      }
      if (completedDate && seed.createdAt && completedDate < seed.createdAt.slice(0, 10)) {
        return 'Data zakończenia nie może być wcześniejsza niż data utworzenia planu';
      }
      if (effectivenessDate && completedDate && effectivenessDate < completedDate) {
        return 'Data oceny skuteczności nie może być wcześniejsza niż data zakończenia';
      }
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || saving) return;
    const dateError = validateDates();
    if (dateError) {
      toast.error(dateError);
      return;
    }
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

  // Portalled to document.body — this modal is opened from WorkerAttentionSection,
  // whose card carries `animate-fade-up`. That animation targets opacity/transform,
  // which makes the card a stacking context for its lifetime, so a plain nested
  // .modal-overlay (position:fixed, z-index:9999) would still be painted within
  // that card's local stacking order and end up behind later sibling sections
  // (e.g. "Dane urodzenia", "Obywatelstwo") instead of on top of the whole page.
  return createPortal(
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
                  <div className="mt-2">
                    <Button type="button" variant="secondary" onClick={() => setShowCreateTraining(true)}>
                      <Icon name="add" size={16} />
                      Nowe
                    </Button>
                  </div>
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
            ) : isEdit && seed.isTraining ? (
              // Training-linked plan, edit mode: the training itself (dates,
              // description, completion) is owned by "Szkolenia wewnętrzne"
              // (TrainingViewPage/ParticipantsTable) — editing it here too
              // would be a second, divergent source of truth for the same
              // enrollment. Only "Odpowiedzialny" has no home over there, so
              // it's the one field this form still lets you change.
              <div className="form-grid">
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
                      onChange={(e) => handleCompletedDateChange(e.target.value)}
                    />
                    <TextField
                      label="Data oceny skuteczności"
                      name="effectiveness_date"
                      type="date"
                      fullWidth
                      value={effectivenessDate}
                      onChange={(e) => handleEffectivenessDateChange(e.target.value)}
                    />
                  </>
                )}
                <div className="form-field-full">
                  <StatusSelect value={status} onChange={handleStatusChange} />
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
      {showCreateTraining && <CreateTrainingModal onClose={() => setShowCreateTraining(false)} onCreated={handleTrainingCreated} />}
    </div>,
    document.body,
  );
}
