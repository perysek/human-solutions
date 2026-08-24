import { useRef } from 'react';
import { Icon } from '@/lib/icons/Icon';
import { useFocusTrap } from '@/lib/a11y/useFocusTrap';
import { useEscapeClaim } from '@/lib/a11y/useEscapeClaim';
import { TrainingForm } from '@/pages/trainings/TrainingForm';

interface CreateTrainingModalProps {
  onClose: () => void;
  /** Called with the newly created training's id once TrainingForm's own
   * submit succeeds — the caller (ActionPlanModal's "+ Nowe" flow) decides
   * what to do with it (link the gap's skill, select it, reload options). */
  onCreated: (id: number) => void;
}

/** Nested modal opened from ActionPlanModal's "Szkolenie" picker via its
 * "+ Nowe" button — lets the user create a training without leaving the
 * "plan działania" flow, instead of navigating away and losing the
 * in-progress form. Reuses TrainingForm as-is (same fields/validation as
 * the standalone /trainings/create page) rather than duplicating it.
 * Stacks on top of ActionPlanModal: both are position:fixed .modal-overlay
 * at the same z-index, so mounting this one later in the tree is enough to
 * paint it on top (same pattern SearchableSelect's own popover already
 * relies on inside this modal). */
export function CreateTrainingModal({ onClose, onCreated }: CreateTrainingModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(true, panelRef);
  useEscapeClaim(true);

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
        aria-labelledby="create-training-modal-title"
        className="modal-content"
        style={{ maxWidth: '34rem' }}
      >
        <div className="modal-header">
          <h3 id="create-training-modal-title">Nowe szkolenie</h3>
          <button type="button" className="modal-close" aria-label="Zamknij" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="modal-body">
          <TrainingForm mode="create" onSaved={onCreated} onCancel={onClose} />
        </div>
      </div>
    </div>
  );
}
