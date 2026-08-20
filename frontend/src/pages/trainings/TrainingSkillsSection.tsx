import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/lib/icons/Icon';
import { useApiData } from '@/lib/api/useApiData';
import { trainingsApi } from '@/lib/api/trainings';
import { skillsApi } from '@/lib/api/skills';
import { useToast } from '@/lib/feedback/ToastProvider';
import { useConfirm } from '@/lib/feedback/ConfirmProvider';

/** TRN_4 — which skills this training covers. Same shape as TrainingJobsSection. */
export function TrainingSkillsSection({ trainingId }: { trainingId: number }) {
  const { data, loading, reload } = useApiData(() => trainingsApi.getSkillLinks(trainingId), [trainingId]);
  const { data: skillsData } = useApiData(() => skillsApi.list());
  const toast = useToast();
  const confirm = useConfirm();

  const [newSkillId, setNewSkillId] = useState('');
  const [saving, setSaving] = useState(false);

  const links = useMemo(() => data?.skills ?? [], [data]);
  const availableSkills = useMemo(
    () => (skillsData?.skills ?? []).filter((s) => !links.some((l) => l.skill_id === s.id)),
    [skillsData, links],
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
    <div className="form-card animate-fade-up" style={{ maxWidth: '40rem' }}>
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

      <div className="flex items-end gap-2">
        <div style={{ flex: 1 }}>
          <label className="form-label">Dodaj umiejętność</label>
          <select className="form-select" value={newSkillId} onChange={(e) => setNewSkillId(e.target.value)}>
            <option value="">Wybierz…</option>
            {availableSkills.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id} — {s.description}
              </option>
            ))}
          </select>
        </div>
        <Button type="button" variant="secondary" onClick={handleAdd} disabled={!newSkillId || saving}>
          <Icon name="add" size={16} />
          Dodaj
        </Button>
      </div>
    </div>
  );
}
