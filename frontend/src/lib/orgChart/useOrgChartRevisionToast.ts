import { useNavigate } from 'react-router-dom';
import type { OrgChartPendingChangeDelta } from '@/lib/api/departments';
import { useToast } from '@/lib/feedback/ToastProvider';

/**
 * Toast after every org-structure DB update.
 *
 * Every departments/jobs mutation endpoint already tells us, in the same
 * response, whether it just recorded a new structural change (see
 * services/org_chart_service.py's capture_pending_change_delta) — `null`
 * means nothing structural happened (a plain description edit, a fresh
 * non-managerial job, …), so this deliberately shows NOTHING in that case
 * rather than a toast for every save. No polling, no client-side
 * before/after diffing: the backend is the single source of truth, same as
 * it is for what counts as "structural" in the first place.
 *
 * Since migration d6d10b667838 removed the auto-revision trigger, a save no
 * longer creates a revision by itself — it just adds to the pending-changes
 * backlog NewRevisionModal shows. The toast reflects that: it reports what
 * just got recorded and points at "+ Nowa rewizja" instead of announcing a
 * revision that doesn't exist yet.
 *
 * Returns one function, `notify`, meant to be called with whatever
 * `pending_change` field came back from a departments/jobs API call — every
 * call site (DepartmentForm, JobForm, DepartmentEditPage,
 * DepartmentsListPage, AddJobsToDepartmentModal, JobsListPage, …) shares
 * this exact wording/behaviour instead of five near-duplicate toast calls.
 */
export function useOrgChartRevisionToast() {
  const toast = useToast();
  const navigate = useNavigate();

  function notify(delta: OrgChartPendingChangeDelta | null | undefined) {
    if (!delta || delta.descriptions.length === 0) return;
    const message = delta.descriptions.length === 1
      ? `Zmiana struktury zapisana — oczekuje na nową rewizję (${delta.descriptions[0]}).`
      : `${delta.descriptions.length} zmiany struktury zapisane — oczekują na nową rewizję.`;
    toast.info(message, 6000, {
      label: 'Utwórz rewizję',
      // OrgChartPage reads `new-revision=1` on mount to open NewRevisionModal
      // directly — see that page's own useEffect (same pattern it already
      // uses for `history=1`).
      onClick: () => navigate('/org-chart?new-revision=1'),
    });
  }

  return { notify };
}
