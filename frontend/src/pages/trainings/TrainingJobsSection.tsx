import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/lib/icons/Icon';
import { useApiData } from '@/lib/api/useApiData';
import { trainingsApi } from '@/lib/api/trainings';
import { jobsApi } from '@/lib/api/jobs';
import { useToast } from '@/lib/feedback/ToastProvider';
import { useConfirm } from '@/lib/feedback/ConfirmProvider';

/** TRN_3 — which jobs this training is relevant for. Same replace-the-whole-set
 * shape as JobSkillsSection (Faza 3) — PUT sends the full linked-job list. */
export function TrainingJobsSection({ trainingId }: { trainingId: number }) {
  const { data, loading, reload } = useApiData(() => trainingsApi.getJobLinks(trainingId), [trainingId]);
  const { data: jobsData } = useApiData(() => jobsApi.list());
  const toast = useToast();
  const confirm = useConfirm();

  const [newJobId, setNewJobId] = useState('');
  const [saving, setSaving] = useState(false);

  const links = useMemo(() => data?.jobs ?? [], [data]);
  const availableJobs = useMemo(
    () => (jobsData?.jobs ?? []).filter((j) => !links.some((l) => l.job_id === j.id)),
    [jobsData, links],
  );

  async function persist(next: string[]) {
    setSaving(true);
    try {
      await trainingsApi.setJobLinks(trainingId, next);
      toast.success('Powiązania zaktualizowane.');
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się zapisać.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAdd() {
    if (!newJobId) return;
    await persist([...links.map((l) => l.job_id), newJobId]);
    setNewJobId('');
  }

  async function handleRemove(jobId: string, label: string) {
    const ok = await confirm({
      title: 'Usunąć powiązanie?',
      message: `Stanowisko "${label}" przestanie być powiązane z tym szkoleniem.`,
      confirmText: 'Usuń',
      type: 'danger',
    });
    if (!ok) return;
    await persist(links.filter((l) => l.job_id !== jobId).map((l) => l.job_id));
  }

  return (
    <div className="form-card animate-fade-up" style={{ maxWidth: '40rem' }}>
      <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--color-ink)' }}>
        Powiązane stanowiska
      </h2>

      {loading ? (
        <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.875rem' }}>Ładowanie…</p>
      ) : links.length === 0 ? (
        <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.875rem', marginBottom: '1rem' }}>Brak powiązanych stanowisk.</p>
      ) : (
        <table className="refined-table" style={{ marginBottom: '1rem' }}>
          <thead>
            <tr>
              <th>Stanowisko</th>
              <th className="text-right">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {links.map((l) => (
              <tr key={l.job_id}>
                <td>{l.job_description ?? l.job_id}</td>
                <td className="text-right">
                  <button
                    type="button"
                    className="action-icon-btn"
                    title="Usuń"
                    aria-label={`Usuń powiązanie ${l.job_description ?? l.job_id}`}
                    onClick={() => handleRemove(l.job_id, l.job_description ?? l.job_id)}
                    disabled={saving}
                  >
                    <Icon name="delete" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="flex items-end gap-2">
        <div style={{ flex: 1 }}>
          <label className="form-label">Dodaj stanowisko</label>
          <select className="form-select" value={newJobId} onChange={(e) => setNewJobId(e.target.value)}>
            <option value="">Wybierz…</option>
            {availableJobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.id} — {j.description}
              </option>
            ))}
          </select>
        </div>
        <Button type="button" variant="secondary" onClick={handleAdd} disabled={!newJobId || saving}>
          <Icon name="add" size={16} />
          Dodaj
        </Button>
      </div>
    </div>
  );
}
