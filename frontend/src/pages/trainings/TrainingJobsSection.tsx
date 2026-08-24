import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Icon } from '@/lib/icons/Icon';
import { useApiData } from '@/lib/api/useApiData';
import { trainingsApi, type TrainingJobLink } from '@/lib/api/trainings';
import { jobsApi, type JobListItem } from '@/lib/api/jobs';
import { skillsApi } from '@/lib/api/skills';
import { useToast } from '@/lib/feedback/ToastProvider';
import { useConfirm } from '@/lib/feedback/ConfirmProvider';

/** Union of every job that requires any of `skillIds` (reverse of
 * TrainingSkillsSection's fetchSkillsRequiredByJobs), deduped by job_id.
 * Empty skill list -> empty result, not "all jobs" — mirrors that
 * function's own docstring for the same reason. */
async function fetchJobsRequiredBySkills(skillIds: string[]): Promise<JobListItem[]> {
  if (skillIds.length === 0) return [];
  const perSkill = await Promise.all(skillIds.map((id) => skillsApi.getJobs(id)));
  const byJobId = new Map<string, JobListItem>();
  for (const { jobs } of perSkill) {
    for (const j of jobs) {
      if (!byJobId.has(j.job_id))
        byJobId.set(j.job_id, {
          id: j.job_id,
          description: j.job_description,
          department_id: null,
          department_name: null,
          is_managerial: false,
          is_director: false,
          supervisor_job_id: null,
          supervisor_job_description: null,
          worker_count: 0,
          created_at: null,
          updated_at: null,
        });
    }
  }
  return [...byJobId.values()];
}

interface TrainingJobsSectionProps {
  trainingId: number;
  /** Owned by TrainingViewPage (not fetched here) so the sibling
   * TrainingSkillsSection sees the same, always-current job-link set —
   * see TrainingViewPage's comment on why this is lifted. */
  jobLinks: TrainingJobLink[];
  loading: boolean;
  reload: () => void;
  /** Called after a job's auto-added participants are persisted, so the
   * sibling ParticipantsTable (fed from TrainingViewPage's own
   * getParticipants fetch) picks up the new rows. */
  onParticipantsChanged: () => void;
  /** Also lifted from TrainingViewPage (see jobLinks) — once a skill is
   * linked, "Dodaj stanowisko" narrows to jobs that actually require it,
   * the same way linkedJobIds narrows TrainingSkillsSection's own dropdown. */
  linkedSkillIds: string[];
}

/** TRN_3 — which jobs this training is relevant for. Same replace-the-whole-set
 * shape as JobSkillsSection (Faza 3) — PUT sends the full linked-job list.
 *
 * Also auto-enrolls participants: adding a job here registers every active
 * worker currently holding that job as a training participant (manual
 * "Dodaj uczestnika" in ParticipantsTable is untouched and still allows
 * enrolling workers whose job isn't linked here at all). Removing a job link
 * deliberately does NOT remove the participants it added — that would
 * silently delete attendance/remarks a user may have already filled in. */
export function TrainingJobsSection({
  trainingId,
  jobLinks: links,
  loading,
  reload,
  onParticipantsChanged,
  linkedSkillIds,
}: TrainingJobsSectionProps) {
  // No skill linked yet -> every job is a candidate (unfiltered dictionary);
  // once at least one skill is linked, narrow to jobs that actually require
  // one of them — same no-skills/has-skills split TrainingSkillsSection
  // uses for its own dropdown, just mirrored.
  const { data: jobsData } = useApiData(() => jobsApi.list());
  const { data: requiredJobs } = useApiData(() => fetchJobsRequiredBySkills(linkedSkillIds), [linkedSkillIds.join(',')]);
  const toast = useToast();
  const confirm = useConfirm();

  const [newJobId, setNewJobId] = useState('');
  const [saving, setSaving] = useState(false);

  const availableJobs = useMemo(() => {
    const candidateJobs = linkedSkillIds.length === 0 ? (jobsData?.jobs ?? []) : (requiredJobs ?? []);
    return candidateJobs.filter((j) => !links.some((l) => l.job_id === j.id));
  }, [linkedSkillIds.length, jobsData, requiredJobs, links]);

  /** Caller owns the `saving` toggle (not this function) so handleAdd can
   * keep the "Dodaj" button disabled across both the link save AND the
   * auto-enroll pass that follows it — otherwise the button would briefly
   * re-enable between the two awaited steps, letting a fast second click
   * start a concurrent auto-enroll that races the first on the same
   * duplicate-check (see autoEnrollWorkersFromJob's docstring for why that
   * matters here specifically). */
  async function persist(next: string[]) {
    try {
      await trainingsApi.setJobLinks(trainingId, next);
      toast.success('Powiązania zaktualizowane.');
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się zapisać.');
      throw err;
    }
  }

  /** Registers every active worker holding `jobId` who isn't already a
   * participant. Re-fetches the current roster right before adding (rather
   * than trusting a prop that could be stale) so this dedup check is
   * correct at call time, not just at render time — getParticipants only
   * returns non-deleted rows, so a worker whose enrollment was soft-deleted
   * is treated as not-yet-enrolled and can be re-added here. */
  async function autoEnrollWorkersFromJob(jobId: string, jobLabel: string) {
    try {
      const [{ workers }, { participants }] = await Promise.all([
        jobsApi.getWorkers(jobId),
        trainingsApi.getParticipants(trainingId),
      ]);
      const alreadyEnrolled = new Set(participants.map((p) => p.worker_id));
      const toEnroll = workers.filter((w) => w.is_active && !alreadyEnrolled.has(w.id));
      if (toEnroll.length === 0) return;

      for (const worker of toEnroll) {
        await trainingsApi.addParticipant(trainingId, { worker_id: worker.id });
      }
      toast.success(`Dodano ${toEnroll.length} uczestników ze stanowiska „${jobLabel}”.`);
      onParticipantsChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się automatycznie dodać uczestników ze stanowiska.');
    }
  }

  async function handleAdd() {
    if (!newJobId) return;
    const jobId = newJobId;
    const jobLabel = availableJobs.find((j) => j.id === jobId)?.description ?? jobId;
    setSaving(true);
    try {
      await persist([...links.map((l) => l.job_id), jobId]);
      setNewJobId('');
      await autoEnrollWorkersFromJob(jobId, jobLabel);
    } catch {
      // persist() already toasted the failure — nothing further to do,
      // and skipping auto-enroll here is correct: the job link never saved.
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(jobId: string, label: string) {
    const ok = await confirm({
      title: 'Usunąć powiązanie?',
      message: `Stanowisko "${label}" przestanie być powiązane z tym szkoleniem.`,
      confirmText: 'Usuń',
      type: 'danger',
    });
    if (!ok) return;
    setSaving(true);
    try {
      await persist(links.filter((l) => l.job_id !== jobId).map((l) => l.job_id));
    } catch {
      // already toasted by persist()
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="form-card animate-fade-up">
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
              <th className="text-right"><span className="sr-only">Akcje</span></th>
            </tr>
          </thead>
          <tbody>
            {links.map((l) => (
              <tr key={l.job_id}>
                <td>{l.job_description ?? l.job_id}</td>
                <td className="text-right">
                  <button
                    type="button"
                    className="action-icon-btn danger-hover"
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

      {linkedSkillIds.length > 0 && availableJobs.length === 0 ? (
        <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.875rem' }}>
          Wszystkie stanowiska wymagające powiązanych umiejętności są już dodane.
        </p>
      ) : (
      <div className="flex items-end gap-2">
        <div style={{ flex: 1 }}>
          <SearchableSelect
            id="training-jobs-add-job"
            label="Dodaj stanowisko"
            options={availableJobs.map((j) => ({ value: j.id, label: `${j.id} — ${j.description}` }))}
            value={newJobId}
            onChange={setNewJobId}
          />
        </div>
        <Button type="button" variant="secondary" onClick={handleAdd} disabled={!newJobId || saving}>
          <Icon name="add" size={16} />
          Dodaj
        </Button>
      </div>
      )}
    </div>
  );
}
