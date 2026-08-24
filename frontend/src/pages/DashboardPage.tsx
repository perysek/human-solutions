import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { AlertPanel, type AlertPanelRow } from '@/components/dashboard/AlertPanel';
import { useApiData } from '@/lib/api/useApiData';
import { dashboardApi, isOwnTrainingsAlerts } from '@/lib/api/dashboard';
import { useAuth } from '@/lib/auth/AuthContext';

const MEDICAL_KIND_LABELS: Record<string, string> = { Preliminary: 'Wstępne', Periodic: 'Okresowe' };
const BHP_KIND_LABELS: Record<string, string> = { Initial: 'Wstępne', Periodic: 'Okresowe', Control: 'Kontrolne' };

/** DSH_1-4 (IMPLEMENTATION_PLAN.md §11) — the pulpit landing page (route
 * "/"), replacing the old bare redirect to /profile. Role-aware body: full
 * access sees the three employee alert panels; `trainer` sees only their
 * own upcoming trainings (see dashboardApi.alerts' DashboardAlerts union
 * and services/dashboard_service.py's get_alerts docstring for why). */
export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: summary, loading: summaryLoading, error: summaryError } = useApiData(() => dashboardApi.summary(), []);
  const { data: alerts, loading: alertsLoading, error: alertsError } = useApiData(() => dashboardApi.alerts(), []);

  const medicalRows: AlertPanelRow[] =
    alerts && !isOwnTrainingsAlerts(alerts)
      ? alerts.medical.map((r) => ({
          key: `m-${r.id}`,
          id: r.worker_id,
          fullName: r.full_name,
          detail: MEDICAL_KIND_LABELS[r.kind] ?? r.kind,
          date: r.valid_until,
          bucket: r.bucket,
        }))
      : [];

  const bhpRows: AlertPanelRow[] =
    alerts && !isOwnTrainingsAlerts(alerts)
      ? alerts.bhp.map((r) => ({
          key: `b-${r.id}`,
          id: r.worker_id,
          fullName: r.full_name,
          detail: BHP_KIND_LABELS[r.kind] ?? r.kind,
          date: r.valid_until,
          bucket: r.bucket,
        }))
      : [];

  const foreignerDocRows: AlertPanelRow[] =
    alerts && !isOwnTrainingsAlerts(alerts)
      ? alerts.foreigner_docs.map((r, i) => ({
          key: `f-${r.worker_id}-${i}`,
          id: r.worker_id,
          fullName: r.full_name,
          detail: r.document_kind ?? 'Dokument',
          date: r.document_validity,
          bucket: r.bucket,
        }))
      : [];

  // Task 2 — orphan job-positions (jobs.department_id IS NULL). Fixed
  // 'notice' bucket: not an expiry alert (no date of its own), just flagged
  // as a data-completeness gap worth a look, not urgent.
  // "14 dni do zwolnienia" — pending notices of termination (the worker's
  // "Dezaktywuj" -> "Złożenie wypowiedzenia" flow) whose planned_fire_date
  // is coming up. No custom onRowClick — AlertPanel's default (navigate to
  // /workers/:id) is exactly the "nav-buttons routing to employee view"
  // this section needs.
  const upcomingTerminationRows: AlertPanelRow[] =
    alerts && !isOwnTrainingsAlerts(alerts)
      ? alerts.upcoming_terminations.map((r) => ({
          key: `t-${r.worker_id}`,
          id: r.worker_id,
          fullName: r.full_name,
          detail: 'Planowana data zwolnienia',
          date: r.planned_fire_date,
          bucket: r.bucket,
        }))
      : [];

  // Task 7 — "Zaległe szkolenia": pending_participants + delay_days both
  // folded into `detail` (AlertPanelRow has no dedicated slot for a second
  // number), `date`/`dateLabel` still carries the training's own planned
  // date so both facts are visible on the card at once.
  const overdueTrainingRows: AlertPanelRow[] =
    alerts && !isOwnTrainingsAlerts(alerts)
      ? alerts.overdue_trainings.map((t) => ({
          key: `ot-${t.id}`,
          id: String(t.id),
          fullName: t.description,
          detail: `${t.pending_participants} do przeszkolenia · zaległość ${t.delay_days} dni`,
          date: t.training_date,
          bucket: t.bucket,
        }))
      : [];

  // Task 7 — "Działania do luk kompetencji": routes to the plans list
  // (not a single plan's own view — that page has no per-row deep link),
  // carrying `returnTo` so ActionPlansPage's Escape handler knows to land
  // back on the pulpit rather than doing nothing.
  const overdueActionPlanRows: AlertPanelRow[] =
    alerts && !isOwnTrainingsAlerts(alerts)
      ? alerts.overdue_action_plans.map((p) => ({
          key: `ap-${p.id}`,
          id: String(p.id),
          fullName: p.description,
          detail: `Odpowiedzialny: ${p.responsible_name ?? 'Nieprzypisany'} · zaległość ${p.delay_days} dni`,
          date: p.planned_date,
          bucket: p.bucket,
        }))
      : [];

  const orphanJobRows: AlertPanelRow[] =
    alerts && !isOwnTrainingsAlerts(alerts)
      ? alerts.orphan_jobs.map((r) => ({
          key: `j-${r.id}`,
          id: r.id,
          fullName: r.description || r.id,
          detail: 'Stanowisko bez przypisanego działu',
          date: null,
          bucket: 'notice' as const,
        }))
      : [];

  return (
    <div className="refined-page">
      <PageHeader
        title="Pulpit"
        subtitle="Podsumowanie i alerty wygasających terminów"
        actions={
          user?.role === 'superadmin' ? (
            <button type="button" className="refined-btn-secondary" onClick={() => navigate('/alert-thresholds')}>
              Progi alertów
            </button>
          ) : undefined
        }
      />

      {summaryError ? (
        <EmptyState icon="error" title="Nie udało się wczytać podsumowania" message={summaryError} />
      ) : (
        <div className="stats-grid">
          <StatCard label="Aktywni pracownicy" value={summaryLoading ? '…' : (summary?.active_workers ?? 0)} icon="people" color="blue" index={0} />
          <StatCard
            label="Szkolenia w tym miesiącu"
            value={summaryLoading ? '…' : (summary?.trainings_this_month ?? 0)}
            icon="event"
            color="green"
            index={1}
          />
        </div>
      )}

      {alertsLoading ? (
        <p className="page-subtitle">Ładowanie alertów…</p>
      ) : alertsError ? (
        <EmptyState icon="error" title="Nie udało się wczytać alertów" message={alertsError} />
      ) : alerts && isOwnTrainingsAlerts(alerts) ? (
        <div className="refined-card" style={{ padding: '1.25rem' }}>
          <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--color-ink)' }}>
            Moje szkolenia
          </h2>
          {alerts.own_trainings.length === 0 ? (
            <EmptyState icon="event" title="Brak szkoleń" message="Nie figurujesz jako trener na żadnym szkoleniu." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {alerts.own_trainings.map((t) => (
                <div
                  key={t.id}
                  onClick={() => navigate(`/trainings/${t.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') navigate(`/trainings/${t.id}`);
                  }}
                  tabIndex={0}
                  role="button"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.625rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border)',
                    cursor: 'pointer',
                  }}
                >
                  <span className="text-sm" style={{ color: 'var(--color-ink)' }}>
                    {t.description}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--color-ink-subtle)' }}>
                    {t.training_date ? new Date(t.training_date).toLocaleDateString('pl-PL') : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4" style={{ gap: '1rem' }}>
          <AlertPanel title="Badania lekarskie" rows={medicalRows} emptyMessage="Żadne badanie nie wygasa wkrótce." />
          <AlertPanel title="Szkolenia BHP" rows={bhpRows} emptyMessage="Żadne szkolenie BHP nie wygasa wkrótce." />
          <AlertPanel title="Dokumenty cudzoziemców" rows={foreignerDocRows} emptyMessage="Żaden dokument nie wygasa wkrótce." />
          <AlertPanel
            title="14 dni do zwolnienia"
            rows={upcomingTerminationRows}
            emptyMessage="Żaden pracownik nie kończy zatrudnienia w ciągu 14 dni."
            dateLabel="Data zwolnienia"
          />
          <AlertPanel
            title="Zaległe szkolenia"
            rows={overdueTrainingRows}
            emptyMessage="Żadne szkolenie nie jest zaległe."
            dateLabel="Termin szkolenia"
            onRowClick={(row) => navigate(`/trainings/${row.id}`)}
          />
          <AlertPanel
            title="Działania do luk kompetencji"
            rows={overdueActionPlanRows}
            emptyMessage="Brak zaległych działań."
            dateLabel="Planowany termin"
            // task2 — always the list page, not a single plan's own view;
            // returnTo lets ActionPlansPage's Escape handler know to land
            // back here.
            onRowClick={() => navigate('/workers/action-plans', { state: { returnTo: '/' } })}
          />
          <AlertPanel
            title="Stanowiska bez działu"
            rows={orphanJobRows}
            emptyMessage="Każde stanowisko ma przypisany dział."
            // task2 — opens the job's edit page with the "Dział" select
            // pre-expanded/focused (JobEditPage reads this same state shape)
            // and, once saved there, auto-navigates back here instead of to
            // the job's own view page.
            onRowClick={(row) => navigate(`/jobs/${encodeURIComponent(row.id)}/edit`, { state: { focusDepartment: true, returnTo: '/' } })}
          />
        </div>
      )}
    </div>
  );
}
