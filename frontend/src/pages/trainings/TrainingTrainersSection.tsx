import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Icon } from '@/lib/icons/Icon';
import { useApiData } from '@/lib/api/useApiData';
import { trainingsApi, type TrainingTrainerLink } from '@/lib/api/trainings';
import { workersApi } from '@/lib/api/workers';
import { useToast } from '@/lib/feedback/ToastProvider';
import { useConfirm } from '@/lib/feedback/ConfirmProvider';

interface TrainingTrainersSectionProps {
  trainingId: number;
  /** Owned by TrainingViewPage (not fetched here) — same lifting reasoning
   * as TrainingJobsSection's jobLinks: isOwnerTrainer needs this list too,
   * so it's fetched once and shared rather than duplicated. */
  trainerLinks: TrainingTrainerLink[];
  loading: boolean;
  reload: () => void;
}

/** Task 2 — which worker(s) run this training. Same replace-the-whole-set
 * shape as TrainingJobsSection/TrainingSkillsSection, placed first (before
 * those two) since "who runs it" reads as more fundamental training info
 * than which jobs/skills it's linked to. Admin-only, same gate as
 * Jobs/Skills — a `trainer` can see this list (it's how they prove
 * ownership, see TrainingViewPage's isOwnerTrainer) but not edit it. */
export function TrainingTrainersSection({ trainingId, trainerLinks: links, loading, reload }: TrainingTrainersSectionProps) {
  const { data: workersData } = useApiData(() => workersApi.list({ status: 'active', sort: 'surname', page_size: 200 }));
  const toast = useToast();
  const confirm = useConfirm();

  const [newTrainerId, setNewTrainerId] = useState('');
  const [saving, setSaving] = useState(false);

  const availableWorkers = useMemo(
    () => (workersData?.workers ?? []).filter((w) => !links.some((l) => l.trainer_id === w.id)),
    [workersData, links],
  );

  async function persist(next: string[]) {
    try {
      await trainingsApi.setTrainerLinks(trainingId, next);
      toast.success('Powiązania zaktualizowane.');
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się zapisać.');
      throw err;
    }
  }

  async function handleAdd() {
    if (!newTrainerId) return;
    setSaving(true);
    try {
      await persist([...links.map((l) => l.trainer_id), newTrainerId]);
      setNewTrainerId('');
    } catch {
      // persist() already toasted the failure
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(trainerId: string, label: string) {
    const ok = await confirm({
      title: 'Usunąć prowadzącego?',
      message: `"${label}" przestanie być prowadzącym tego szkolenia.`,
      confirmText: 'Usuń',
      type: 'danger',
    });
    if (!ok) return;
    setSaving(true);
    try {
      await persist(links.filter((l) => l.trainer_id !== trainerId).map((l) => l.trainer_id));
    } catch {
      // already toasted by persist()
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="form-card animate-fade-up">
      <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--color-ink)' }}>
        Prowadzący
      </h2>

      {loading ? (
        <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.875rem' }}>Ładowanie…</p>
      ) : links.length === 0 ? (
        <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.875rem', marginBottom: '1rem' }}>Brak przypisanych prowadzących.</p>
      ) : (
        <table className="refined-table" style={{ marginBottom: '1rem' }}>
          <thead>
            <tr>
              <th>Prowadzący</th>
              <th className="text-right"><span className="sr-only">Akcje</span></th>
            </tr>
          </thead>
          <tbody>
            {links.map((l) => (
              <tr key={l.trainer_id}>
                <td>{l.trainer_name}</td>
                <td className="text-right">
                  <button
                    type="button"
                    className="action-icon-btn danger-hover"
                    title="Usuń"
                    aria-label={`Usuń prowadzącego ${l.trainer_name}`}
                    onClick={() => handleRemove(l.trainer_id, l.trainer_name)}
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
          <SearchableSelect
            id="training-trainers-add"
            label="Dodaj prowadzącego"
            options={availableWorkers.map((w) => ({ value: w.id, label: `${w.surname} ${w.firstname}` }))}
            value={newTrainerId}
            onChange={setNewTrainerId}
          />
        </div>
        <Button type="button" variant="secondary" onClick={handleAdd} disabled={!newTrainerId || saving}>
          <Icon name="add" size={16} />
          Dodaj
        </Button>
      </div>
    </div>
  );
}
