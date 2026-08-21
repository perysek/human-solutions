import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { SelectWrap } from '@/components/ui/SelectWrap';
import { Icon } from '@/lib/icons/Icon';
import { useApiData } from '@/lib/api/useApiData';
import { jobsApi } from '@/lib/api/jobs';
import { skillsApi } from '@/lib/api/skills';
import { useToast } from '@/lib/feedback/ToastProvider';
import { useConfirm } from '@/lib/feedback/ConfirmProvider';

const RATING_OPTIONS = [1, 2, 3];

/** JOB_2/JOB_4 — a job's required-skills matrix. Every add/remove sends the
 * whole replacement set to PUT /jobs/api/<id>/skills (matches
 * JobSkillRepository.replace_requirements' delete-then-insert shape) rather
 * than per-row endpoints — simpler given how few rows this list ever has. */
export function JobSkillsSection({ jobId, canWrite }: { jobId: string; canWrite: boolean }) {
  const { data, loading, reload } = useApiData(() => jobsApi.getSkills(jobId), [jobId]);
  const { data: skillsData } = useApiData(() => skillsApi.list());
  const toast = useToast();
  const confirm = useConfirm();

  const [newSkillId, setNewSkillId] = useState('');
  const [newRating, setNewRating] = useState(2);
  const [saving, setSaving] = useState(false);

  const requirements = useMemo(() => data?.skills ?? [], [data]);
  const availableSkills = useMemo(
    () => (skillsData?.skills ?? []).filter((s) => !requirements.some((r) => r.skill_id === s.id)),
    [skillsData, requirements],
  );

  async function persist(next: { skill_id: string; required_rating: number }[]) {
    setSaving(true);
    try {
      await jobsApi.setSkills(jobId, next);
      toast.success('Wymagania zaktualizowane.');
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się zapisać.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAdd() {
    if (!newSkillId) return;
    const next = [
      ...requirements.map((r) => ({ skill_id: r.skill_id, required_rating: r.required_rating })),
      { skill_id: newSkillId, required_rating: newRating },
    ];
    await persist(next);
    setNewSkillId('');
    setNewRating(2);
  }

  async function handleRemove(skillId: string, label: string) {
    const ok = await confirm({
      title: 'Usunąć wymaganie?',
      message: `Umiejętność "${label}" przestanie być wymagana dla tego stanowiska.`,
      confirmText: 'Usuń',
      type: 'danger',
    });
    if (!ok) return;
    const next = requirements.filter((r) => r.skill_id !== skillId).map((r) => ({ skill_id: r.skill_id, required_rating: r.required_rating }));
    await persist(next);
  }

  return (
    <div className="form-card animate-fade-up" style={{ maxWidth: '40rem' }}>
      <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--color-ink)' }}>
        Wymagane umiejętności
      </h2>

      {loading ? (
        <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.875rem' }}>Ładowanie…</p>
      ) : requirements.length === 0 ? (
        <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.875rem', marginBottom: canWrite ? '1rem' : 0 }}>
          Brak zdefiniowanych wymagań.
        </p>
      ) : (
        <table className="refined-table" style={{ marginBottom: canWrite ? '1rem' : 0 }}>
          <thead>
            <tr>
              <th>Umiejętność</th>
              <th>Wymagana ocena</th>
              {canWrite && <th className="text-right">Akcje</th>}
            </tr>
          </thead>
          <tbody>
            {requirements.map((r) => (
              <tr key={r.skill_id}>
                <td>{r.skill_description}</td>
                <td>{r.required_rating}</td>
                {canWrite && (
                  <td className="text-right">
                    <button
                      type="button"
                      className="action-icon-btn"
                      title="Usuń"
                      aria-label={`Usuń wymaganie ${r.skill_description}`}
                      onClick={() => handleRemove(r.skill_id, r.skill_description)}
                      disabled={saving}
                    >
                      <Icon name="delete" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {canWrite && (
        <div className="flex items-end gap-2">
          <div style={{ flex: 1 }}>
            <label className="form-label">Dodaj umiejętność</label>
            <SelectWrap>
              <select className="form-select" value={newSkillId} onChange={(e) => setNewSkillId(e.target.value)}>
                <option value="">Wybierz…</option>
                {availableSkills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id} — {s.description}
                  </option>
                ))}
              </select>
            </SelectWrap>
          </div>
          <div>
            <label className="form-label">Ocena</label>
            <SelectWrap>
              <select className="form-select" value={newRating} onChange={(e) => setNewRating(Number(e.target.value))}>
                {RATING_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
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
