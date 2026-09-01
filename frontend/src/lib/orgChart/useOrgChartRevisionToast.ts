import { useNavigate } from 'react-router-dom';
import type { OrgChartRevisionDelta } from '@/lib/api/departments';
import { useToast } from '@/lib/feedback/ToastProvider';

/**
 * TASK3 — "toast notification after each org-structure related db update".
 *
 * Every departments/jobs mutation endpoint already tells us, in the same
 * response, whether it actually bumped org_chart_revisions (see
 * services/org_chart_service.py's capture_revision_delta) — `null` means
 * the DB trigger recorded no structural change (a plain description edit,
 * a fresh non-managerial job, …), so this deliberately shows NOTHING in
 * that case rather than a toast for every save. No polling, no client-side
 * before/after diffing: the backend is the single source of truth for
 * "did the chart's shape change", same as it is for the trigger itself.
 *
 * Returns one function, `notify`, meant to be called with whatever
 * `org_chart_revision` field came back from a departments/jobs API call —
 * every call site (DepartmentForm, JobForm, DepartmentEditPage,
 * DepartmentsListPage, AddJobsToDepartmentModal, JobsListPage, …) shares
 * this exact wording/behaviour instead of five near-duplicate toast calls.
 */
export function useOrgChartRevisionToast() {
  const toast = useToast();
  const navigate = useNavigate();

  function notify(delta: OrgChartRevisionDelta | null | undefined) {
    if (!delta) return;
    const when = new Date(delta.revised_at).toLocaleString('pl-PL');
    toast.info(
      `Struktura organizacyjna zaktualizowana — Rev. ${delta.id} · ${when} (${delta.label}).`,
      6000,
      {
        label: 'Zobacz historię zmian',
        // OrgChartPage (§4e+4f, joined page-view) reads `history=1` on mount
        // to expand the revisions disclosure and scroll it into view — see
        // that page's own useEffect.
        onClick: () => navigate('/org-chart?history=1'),
      },
    );
  }

  return { notify };
}
