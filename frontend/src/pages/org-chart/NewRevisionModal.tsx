import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { useEscapeClaim } from '@/lib/a11y/useEscapeClaim';
import { useFocusTrap } from '@/lib/a11y/useFocusTrap';
import { orgChartApi, type OrgChartTree as OrgChartTreeData } from '@/lib/api/orgChart';
import { ApiError } from '@/lib/api/client';
import { useApiData } from '@/lib/api/useApiData';
import { useToast } from '@/lib/feedback/ToastProvider';
import { Icon } from '@/lib/icons/Icon';
import { OrgChartTree } from './OrgChartTree';

/** How long the press-and-hold preview's CSS transition takes (must match
 * styles/components.css's .org-chart-preview-overlay transition-duration)
 * — the panel stays mounted this long after release so the collapse
 * animation gets to finish before unmounting, instead of popping away
 * mid-transition. */
const PREVIEW_COLLAPSE_MS = 200;

interface NewRevisionModalProps {
  onClose: () => void;
  /** Called once a revision is actually created — the caller (OrgChartPage)
   * uses this to refetch the latest-revision badge and pending-count. */
  onCreated: () => void;
  /** The page's already-fetched live tree — the "podgląd zmian" is exactly
   * this same tree, no separate fetch or hypothetical-apply step needed
   * (departments/jobs write straight to their live tables regardless of
   * revision bookkeeping — see services/org_chart_service.py's module
   * docstring). */
  tree: OrgChartTreeData;
}

/**
 * "+ Nowa rewizja" header button opens this. Replaces the old auto-created-
 * on-every-save revision flow (migration d6d10b667838): the user reviews
 * every structural change pending since the last revision and explicitly
 * bundles them into one new revision, instead of one revision per field
 * edit.
 *
 * Same modal shell as components/trainings/CreateTrainingModal.tsx
 * (.modal-overlay/.modal-content/.modal-header/.modal-body/.modal-footer,
 * useFocusTrap/useEscapeClaim).
 */
export function NewRevisionModal({ onClose, onCreated, tree }: NewRevisionModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(true, panelRef);
  useEscapeClaim(true);
  const toast = useToast();

  const { data: pending, loading, error } = useApiData(() => orgChartApi.pendingChanges(), []);
  const [creating, setCreating] = useState(false);

  // previewHeld drives the CSS transition (mousedown -> true, mouseup ->
  // false); previewMounted keeps the overlay in the DOM for
  // PREVIEW_COLLAPSE_MS after release so the collapse actually gets to
  // play instead of the panel just vanishing.
  const [previewHeld, setPreviewHeld] = useState(false);
  const [previewMounted, setPreviewMounted] = useState(false);
  const collapseTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(collapseTimer.current), []);

  function startPreview() {
    clearTimeout(collapseTimer.current);
    setPreviewMounted(true);
    // One frame between mount and adding the open class, or the browser
    // coalesces both style states into one paint and the transition never
    // plays (same reason OrgChartPage's own history-disclosure defers its
    // scrollIntoView past the first paint).
    requestAnimationFrame(() => setPreviewHeld(true));
  }

  function endPreview() {
    setPreviewHeld(false);
    collapseTimer.current = setTimeout(() => setPreviewMounted(false), PREVIEW_COLLAPSE_MS);
  }

  async function handleCreateRevision() {
    setCreating(true);
    try {
      const revision = await orgChartApi.createRevision();
      toast.success(`Utworzono rewizję — ${revision.label}.`);
      onCreated();
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Nie udało się utworzyć rewizji.');
    } finally {
      setCreating(false);
    }
  }

  const changes = pending ?? [];
  const hasChanges = changes.length > 0;

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
        aria-labelledby="new-revision-modal-title"
        className="modal-content"
        style={{ maxWidth: '38rem' }}
      >
        <div className="modal-header">
          <h3 id="new-revision-modal-title">Nowa rewizja struktury</h3>
          <button type="button" className="modal-close" aria-label="Zamknij" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="modal-body">
          {loading ? (
            <TableSkeleton cols={1} rows={4} />
          ) : error ? (
            <EmptyState icon="error" title="Nie udało się wczytać zmian" message={error} />
          ) : !hasChanges ? (
            <EmptyState
              icon="check_circle"
              title="Brak oczekujących zmian"
              message="Struktura nie zmieniła się od ostatniej rewizji."
            />
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {changes.map((change) => (
                <li
                  key={change.id}
                  style={{
                    padding: '0.75rem 0.875rem', borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border)', background: 'var(--color-surface)',
                  }}
                >
                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-ink)' }}>{change.description}</p>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: 'var(--color-ink-muted)' }}>
                    {change.changed_by} · {new Date(change.changed_at).toLocaleString('pl-PL')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <Button
            variant="secondary"
            small
            disabled={!hasChanges}
            onMouseDown={startPreview}
            onMouseUp={endPreview}
            onMouseLeave={endPreview}
            onTouchStart={startPreview}
            onTouchEnd={endPreview}
          >
            <Icon name="visibility" size={16} />
            Podgląd zmian
          </Button>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button variant="secondary" small onClick={onClose}>Może później</Button>
            <Button variant="primary" small disabled={!hasChanges || creating} onClick={handleCreateRevision}>
              {creating ? 'Tworzenie…' : 'Utwórz rewizję'}
            </Button>
          </div>
        </div>
      </div>

      {previewMounted && (
        <div
          className={`org-chart-preview-overlay${previewHeld ? ' is-open' : ''}`}
          role="dialog"
          aria-label="Podgląd wykresu organizacyjnego"
        >
          <div className="org-chart-preview-panel">
            <div className="org-chart-preview-header">Podgląd — bieżący wykres organizacyjny</div>
            <div className="org-chart-preview-body">
              <OrgChartTree tree={tree} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
