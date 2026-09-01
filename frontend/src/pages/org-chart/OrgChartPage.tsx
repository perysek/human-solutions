import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/lib/icons/Icon';
import { useApiData } from '@/lib/api/useApiData';
import { orgChartApi } from '@/lib/api/orgChart';
import { useAuth } from '@/lib/auth/AuthContext';
import { useToast } from '@/lib/feedback/ToastProvider';
import { OrgChartTree } from './OrgChartTree';
import { OrgChartRevisionsSection } from './OrgChartRevisionsSection';
import { NewRevisionModal } from './NewRevisionModal';

/** yyyy-mm-dd, filename-safe — today's date in the local timezone (not
 * `.toISOString()`, which is UTC and could read one day off from what the
 * user's own clock says depending on time of day / timezone). */
function todayForFilename(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * ORG_CHART_PROPOSAL.md §4e+§4f, joined into one page-view per the UI
 * adjustment: the chart (§4e) displays first, the revision history (§4f)
 * follows as an expandable section rather than its own route/nav entry.
 * RBAC stays split exactly as the proposal specified even though the page
 * didn't: the chart itself needs only 'jobs' (this whole page's route
 * gate, router.tsx), the history section independently re-checks 'audit'
 * and renders nothing if that grant is missing — same per-section gating
 * JobViewPage already uses for its own 'workers'-gated subsection. In this
 * app's current RBAC seed the two grants happen to go to the exact same
 * roles (superadmin/hr_manager), but the check stays real rather than
 * assumed in case that ever diverges.
 *
 * TASK2 (PNG/PDF export) lives here too — the header actions call into
 * lib/orgChart/exportOrgChart.ts against `chartRef`, the same DOM node
 * OrgChartTree renders for on-screen display.
 */
export function OrgChartPage() {
  const { hasModuleAccess } = useAuth();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: tree, loading, error } = useApiData(() => orgChartApi.tree(), []);
  const { data: latestRevision, reload: reloadLatestRevision } = useApiData(() => orgChartApi.latestRevision(), []);
  const { data: pendingChanges, reload: reloadPendingChanges } = useApiData(() => orgChartApi.pendingChanges(), []);

  const [historyOpen, setHistoryOpen] = useState(false);
  const historySectionRef = useRef<HTMLDivElement>(null);
  const consumedHistoryParam = useRef(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState<'png' | 'pdf' | null>(null);
  const [newRevisionOpen, setNewRevisionOpen] = useState(false);
  const consumedNewRevisionParam = useRef(false);

  // The org-structure toast links here as `/org-chart?history=1` — expand
  // the section and scroll it into view once, then drop the param so a
  // later manual refresh/back-nav doesn't keep forcing it open.
  useEffect(() => {
    if (consumedHistoryParam.current) return;
    if (searchParams.get('history') !== '1') return;
    consumedHistoryParam.current = true;
    setHistoryOpen(true);
    setSearchParams((params) => {
      params.delete('history');
      return params;
    }, { replace: true });
    // Let the disclosure's own max-height transition start before scrolling
    // — scrolling to a still-collapsed (0px) region would land above it.
    window.setTimeout(() => {
      historySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }, [searchParams, setSearchParams]);

  // Same deep-link pattern as `?history=1` above, for
  // useOrgChartRevisionToast's "Utwórz rewizję" action button — opens
  // NewRevisionModal directly instead of just landing on the page.
  useEffect(() => {
    if (consumedNewRevisionParam.current) return;
    if (searchParams.get('new-revision') !== '1') return;
    consumedNewRevisionParam.current = true;
    setNewRevisionOpen(true);
    setSearchParams((params) => {
      params.delete('new-revision');
      return params;
    }, { replace: true });
  }, [searchParams, setSearchParams]);

  // Dynamic import() (not a static import at the top of the file) — jsPDF +
  // html-to-image together are a meaningfully heavy pair of libraries
  // (jsPDF alone pulls in html2canvas/DOMPurify it doesn't use here, as
  // optional deps of its own unrelated .html() plugin) that every OTHER
  // page in the app would otherwise pay to load on first paint for a
  // feature only this one page has. Code-split, so the cost is only paid
  // the first time someone actually clicks an export button.
  async function handleExportPng() {
    if (!chartRef.current) return;
    setExporting('png');
    try {
      const { exportOrgChartPng } = await import('@/lib/orgChart/exportOrgChart');
      await exportOrgChartPng(chartRef.current, `struktura-organizacyjna-${todayForFilename()}.png`);
    } catch {
      toast.error('Nie udało się wyeksportować wykresu do PNG.');
    } finally {
      setExporting(null);
    }
  }

  async function handleExportPdf() {
    if (!chartRef.current) return;
    setExporting('pdf');
    try {
      const { exportOrgChartPdf } = await import('@/lib/orgChart/exportOrgChart');
      await exportOrgChartPdf(chartRef.current, latestRevision ?? null, `struktura-organizacyjna-${todayForFilename()}.pdf`);
    } catch {
      toast.error('Nie udało się wyeksportować wykresu do PDF.');
    } finally {
      setExporting(null);
    }
  }

  const subtitle = latestRevision ? `Rev. ${latestRevision.id} · ${new Date(latestRevision.revised_at).toLocaleString('pl-PL')}` : undefined;
  const pendingCount = pendingChanges?.length ?? 0;

  function handleRevisionCreated() {
    reloadLatestRevision();
    reloadPendingChanges();
  }

  return (
    <div className="refined-page">
      <PageHeader
        title="Struktura organizacyjna"
        subtitle={subtitle}
        actions={
          <>
            <Button variant="primary" small onClick={() => setNewRevisionOpen(true)}>
              + Nowa rewizja{pendingCount > 0 ? ` (${pendingCount})` : ''}
            </Button>
            {tree && (tree.director || tree.departments.length > 0) ? (
              <>
                <Button variant="secondary" small onClick={handleExportPng} disabled={exporting !== null}>
                  <Icon name="download" size={16} />
                  {exporting === 'png' ? 'Eksportowanie…' : 'Pobierz PNG'}
                </Button>
                <Button variant="secondary" small onClick={handleExportPdf} disabled={exporting !== null}>
                  <Icon name="download" size={16} />
                  {exporting === 'pdf' ? 'Eksportowanie…' : 'Pobierz PDF'}
                </Button>
              </>
            ) : null}
          </>
        }
      />

      {newRevisionOpen && tree && (
        <NewRevisionModal
          tree={tree}
          onClose={() => setNewRevisionOpen(false)}
          onCreated={handleRevisionCreated}
        />
      )}

      {loading ? (
        <p className="page-subtitle">Ładowanie…</p>
      ) : error || !tree ? (
        <EmptyState icon="error" title="Nie udało się wczytać wykresu" message={error ?? undefined} />
      ) : (
        <div className="space-y-4">
          <div className="form-card">
            <OrgChartTree tree={tree} chartRef={chartRef} />
          </div>

          {hasModuleAccess('audit') && (
            <div ref={historySectionRef}>
              <OrgChartRevisionsSection open={historyOpen} onToggle={() => setHistoryOpen((o) => !o)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
