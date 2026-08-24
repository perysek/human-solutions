import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { TextField, FormActions } from '@/components/ui/form';
import { useApiData } from '@/lib/api/useApiData';
import { dashboardApi, type AlertThreshold } from '@/lib/api/dashboard';
import { useToast } from '@/lib/feedback/ToastProvider';
import { ApiError } from '@/lib/api/client';

const MODULE_LABELS: Record<AlertThreshold['module'], string> = {
  medical: 'Badania lekarskie',
  bhp: 'Szkolenia BHP',
  foreigner_docs: 'Dokumenty cudzoziemców',
};

const MODULE_HELP: Record<AlertThreshold['module'], string> = {
  medical: 'Trzy progi (MED_6, DSH_2): pilne / zbliża się / do obserwacji.',
  bhp: 'Trzy progi (BHP_5, DSH_3): pilne / zbliża się / do obserwacji.',
  foreigner_docs: 'Dwa progi w użyciu (WRK_10, DSH_4): pole „do obserwacji" jest zapisywane, ale panel dashboardu go nie pokazuje.',
};

type EditRow = { critical_days: string; warning_days: string; notice_days: string };

/** DSH_5 (IMPLEMENTATION_PLAN.md §11) — superadmin-only editor for
 * alert_thresholds. Edits all three modules locally, then saves them in
 * one PUT (matches routes/dashboard/routes.py's bulk endpoint contract). */
export function AlertThresholdsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload } = useApiData(() => dashboardApi.getThresholds(), []);

  const [rows, setRows] = useState<Record<string, EditRow>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!data) return;
    const next: Record<string, EditRow> = {};
    for (const t of data.thresholds) {
      next[t.module] = {
        critical_days: String(t.critical_days),
        warning_days: String(t.warning_days),
        notice_days: String(t.notice_days),
      };
    }
    setRows(next);
  }, [data]);

  function updateField(module: string, field: keyof EditRow, value: string) {
    setRows((cur) => ({ ...cur, [module]: { ...cur[module], [field]: value } }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const payload = Object.entries(rows).map(([module, r]) => ({
      module,
      critical_days: Number(r.critical_days),
      warning_days: Number(r.warning_days),
      notice_days: Number(r.notice_days),
    }));

    for (const p of payload) {
      if (!Number.isInteger(p.critical_days) || !Number.isInteger(p.warning_days) || !Number.isInteger(p.notice_days)) {
        setFormError(`Progi modułu „${MODULE_LABELS[p.module as AlertThreshold['module']]}" muszą być liczbami całkowitymi.`);
        return;
      }
      if (!(0 < p.critical_days && p.critical_days < p.warning_days && p.warning_days < p.notice_days)) {
        setFormError(
          `Progi modułu „${MODULE_LABELS[p.module as AlertThreshold['module']]}" muszą spełniać: pilne < zbliża się < do obserwacji (liczby dodatnie).`,
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      await dashboardApi.updateThresholds(payload);
      toast.success('Progi alertów zapisane.');
      reload();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Nie udało się zapisać progów.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="refined-page">
      <div className="form-page-shell">
        <PageHeader title="Progi alertów" subtitle="Konfiguracja progów wygasających terminów (DSH_5)" />

        {loading ? (
          <p className="page-subtitle">Ładowanie…</p>
        ) : error || !data ? (
          <EmptyState icon="error" title="Nie udało się wczytać progów" message={error ?? undefined} />
        ) : (
          <form onSubmit={handleSubmit} className="form-shell space-y-3">
            {formError && <div className="flash-message flash-error">{formError}</div>}

            {data.thresholds.map((t) => {
              const row = rows[t.module] ?? { critical_days: '', warning_days: '', notice_days: '' };
              return (
                <div key={t.module} className="form-card">
                  <fieldset className="form-fieldset">
                    <legend className="form-legend">{MODULE_LABELS[t.module]}</legend>
                    <p className="form-fieldset-description">{MODULE_HELP[t.module]}</p>
                    <div className="form-grid">
                      <TextField
                        label="Pilne (dni)"
                        name={`${t.module}-critical`}
                        type="number"
                        min={1}
                        value={row.critical_days}
                        onChange={(e) => updateField(t.module, 'critical_days', e.target.value)}
                        required
                      />
                      <TextField
                        label="Zbliża się (dni)"
                        name={`${t.module}-warning`}
                        type="number"
                        min={1}
                        value={row.warning_days}
                        onChange={(e) => updateField(t.module, 'warning_days', e.target.value)}
                        required
                      />
                      <TextField
                        label="Do obserwacji (dni)"
                        name={`${t.module}-notice`}
                        type="number"
                        min={1}
                        value={row.notice_days}
                        onChange={(e) => updateField(t.module, 'notice_days', e.target.value)}
                        required
                      />
                    </div>
                  </fieldset>
                </div>
              );
            })}

            <FormActions submitLabel="Zapisz progi" onCancel={() => navigate('/')} isLoading={submitting} />
          </form>
        )}
      </div>
    </div>
  );
}
