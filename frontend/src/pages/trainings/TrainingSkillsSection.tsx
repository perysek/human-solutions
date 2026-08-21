import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { SelectWrap } from '@/components/ui/SelectWrap';
import { Icon } from '@/lib/icons/Icon';
import { useApiData } from '@/lib/api/useApiData';
import { trainingsApi } from '@/lib/api/trainings';
import { jobsApi, type JobSkillRequirement } from '@/lib/api/jobs';
import { useToast } from '@/lib/feedback/ToastProvider';
import { useConfirm } from '@/lib/feedback/ConfirmProvider';

/** Union of every skill required by any of `jobIds` (JOB_4's per-job
 * requirement list), deduped by skill_id. Empty job list -> empty result,
 * not "all skills" — see TrainingSkillsSection's docstring for why. */
async function fetchSkillsRequiredByJobs(jobIds: string[]): Promise<JobSkillRequirement[]> {
  if (jobIds.length === 0) return [];
  const perJob = await Promise.all(jobIds.map((id) => jobsApi.getSkills(id)));
  const bySkillId = new Map<string, JobSkillRequirement>();
  for (const { skills } of perJob) {
    for (const s of skills) {
      if (!bySkillId.has(s.skill_id)) bySkillId.set(s.skill_id, s);
    }
  }
  return [...bySkillId.values()];
}

interface TrainingSkillsSectionProps {
  trainingId: number;
  /** Owned by TrainingViewPage, shared with TrainingJobsSection — see that
   * section's props comment for why this isn't fetched independently here. */
  linkedJobIds: string[];
}

/** TRN_4 — which skills this training covers. Same shape as TrainingJobsSection.
 *
 * The "Dodaj umiejętność" dropdown is scoped to skills actually required by
 * this training's linked jobs (job_skills, JOB_4) — not the full skills
 * dictionary — so a linked skill always traces back to a linked job's
 * requirements. No jobs linked yet -> nothing to pick from (a helper message
 * explains why, rather than silently showing an empty select). */
export function TrainingSkillsSection({ trainingId, linkedJobIds }: TrainingSkillsSectionProps) {
  const { data, loading, reload } = useApiData(() => trainingsApi.getSkillLinks(trainingId), [trainingId]);
  const toast = useToast();
  const confirm = useConfirm();

  const [newSkillId, setNewSkillId] = useState('');
  const [saving, setSaving] = useState(false);

  const links = useMemo(() => data?.skills ?? [], [data]);
  const { data: requiredSkills } = useApiData(() => fetchSkillsRequiredByJobs(linkedJobIds), [linkedJobIds.join(',')]);

  const availableSkills = useMemo(
    () => (requiredSkills ?? []).filter((s) => !links.some((l) => l.skill_id === s.skill_id)),
    [requiredSkills, links],
  );

  async function persist(next: string[]) {
    setSaving(true);
    try {
      await trainingsApi.setSkillLinks(trainingId, next);
      toast.success('Powiązania zaktualizowane.');
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się zapisać.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAdd() {
    if (!newSkillId) return;
    await persist([...links.map((l) => l.skill_id), newSkillId]);
    setNewSkillId('');
  }

  async function handleRemove(skillId: string, label: string) {
    const ok = await confirm({
      title: 'Usunąć powiązanie?',
      message: `Umiejętność "${label}" przestanie być powiązana z tym szkoleniem.`,
      confirmText: 'Usuń',
      type: 'danger',
    });
    if (!ok) return;
    await persist(links.filter((l) => l.skill_id !== skillId).map((l) => l.skill_id));
  }

  return (
    <div className="form-card animate-fade-up" style={{ maxWidth: '64rem', margin: '0 auto' }}>
      <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--color-ink)' }}>
        Powiązane umiejętności
      </h2>

      {loading ? (
        <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.875rem' }}>Ładowanie…</p>
      ) : links.length === 0 ? (
        <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.875rem', marginBottom: '1rem' }}>Brak powiązanych umiejętności.</p>
      ) : (
        <table className="refined-table" style={{ marginBottom: '1rem' }}>
          <thead>
            <tr>
              <th>Umiejętność</th>
              <th className="text-right">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {links.map((l) => (
              <tr key={l.skill_id}>
                <td>{l.skill_description}</td>
                <td className="text-right">
                  <button
                    type="button"
                    className="action-icon-btn"
                    title="Usuń"
                    aria-label={`Usuń powiązanie ${l.skill_description}`}
                    onClick={() => handleRemove(l.skill_id, l.skill_description)}
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

      {linkedJobIds.length === 0 ? (
        <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.875rem' }}>
          Najpierw dodaj powiązane stanowisko powyżej — lista dostępnych umiejętności pochodzi z wymagań stanowisk
          powiązanych z tym szkoleniem.
        </p>
      ) : availableSkills.length === 0 ? (
        <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.875rem' }}>
          Wszystkie umiejętności wymagane przez powiązane stanowiska są już dodane.
        </p>
      ) : (
        <div className="flex items-end gap-2">
          <div style={{ flex: 1 }}>
            <label className="form-label">Dodaj umiejętność</label>
            <SelectWrap>
              <select className="form-select" value={newSkillId} onChange={(e) => setNewSkillId(e.target.value)}>
                <option value="">Wybierz…</option>
                {availableSkills.map((s) => (
                  <option key={s.skill_id} value={s.skill_id}>
                    {s.skill_id} — {s.skill_description}
                  </option>
                ))}
              </select>
            </SelectWrap>
          </div>
          <Button type="button" variant="secondary" onClick={handleAdd} disabled={!newSkillId || saving}>
            <Icon name="add" size={16} />
            Dodaj
          </Button>
        </div>
      )}
    </div>
  );
}
