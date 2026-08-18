import { Fragment, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/lib/icons/Icon';
import { useApiData } from '@/lib/api/useApiData';
import { workersApi } from '@/lib/api/workers';
import { skillsApi } from '@/lib/api/skills';
import { useToast } from '@/lib/feedback/ToastProvider';
import { useConfirm } from '@/lib/feedback/ConfirmProvider';

const RATING_OPTIONS = [1, 2, 3];

function GapBadge({ gap }: { gap: number }) {
  if (gap <= 0) return <span className="status-badge active">Spełnia</span>;
  return <span className="status-badge inactive">Luka: {gap}</span>;
}

/** SKL_2/3/4 — a worker's actual skill ratings (editable), per-rating
 * remarks history (SKL_3, append-only — see worker_skill_remarks' own
 * comment for why there's no edit/delete), and the gap-vs-job-requirements
 * table (SKL_4). Rendered as one more stacked Section on WorkerViewPage —
 * the plan calls this a "zakładka" (tab), but this app has no tab
 * component anywhere else; a Section card matches the page's existing
 * pattern instead of introducing a one-off new interaction idiom. */
export function WorkerCompetencySection({ workerId, canWrite }: { workerId: string; canWrite: boolean }) {
  const { data: skillsData, loading: skillsLoading, reload: reloadSkills } = useApiData(() => workersApi.getSkills(workerId), [workerId]);
  const { data: gapData, loading: gapLoading } = useApiData(() => workersApi.getGapAnalysis(workerId), [workerId, skillsData]);
  const { data: allSkillsData } = useApiData(() => skillsApi.list());
  const toast = useToast();
  const confirm = useConfirm();

  const ratings = useMemo(() => skillsData?.skills ?? [], [skillsData]);
  const gaps = gapData?.gaps ?? [];

  const [newSkillId, setNewSkillId] = useState('');
  const [newRating, setNewRating] = useState(2);
  const [saving, setSaving] = useState(false);
  const [expandedSkillId, setExpandedSkillId] = useState<string | null>(null);
  const [remarksBySkill, setRemarksBySkill] = useState<Record<string, { id: number; remarks: string; created_at: string | null }[]>>({});
  const [remarksLoading, setRemarksLoading] = useState(false);
  const [newRemark, setNewRemark] = useState('');

  const availableSkills = useMemo(
    () => (allSkillsData?.skills ?? []).filter((s) => !ratings.some((r) => r.skill_id === s.id)),
    [allSkillsData, ratings],
  );

  async function handleAddRating() {
    if (!newSkillId) return;
    setSaving(true);
    try {
      await workersApi.setSkill(workerId, newSkillId, newRating, new Date().toISOString().slice(0, 10));
      toast.success('Ocena dodana.');
      reloadSkills();
      setNewSkillId('');
      setNewRating(2);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się dodać oceny.');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateRating(skillId: string, rating: number) {
    setSaving(true);
    try {
      await workersApi.updateSkill(workerId, skillId, rating, new Date().toISOString().slice(0, 10));
      toast.success('Ocena zaktualizowana.');
      reloadSkills();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się zaktualizować oceny.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveRating(skillId: string, label: string) {
    const ok = await confirm({
      title: 'Usunąć ocenę?',
      message: `Ocena umiejętności "${label}" zostanie usunięta.`,
      confirmText: 'Usuń',
      type: 'danger',
    });
    if (!ok) return;
    setSaving(true);
    try {
      await workersApi.removeSkill(workerId, skillId);
      toast.success('Ocena usunięta.');
      reloadSkills();
      if (expandedSkillId === skillId) setExpandedSkillId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się usunąć oceny.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleRemarks(skillId: string) {
    if (expandedSkillId === skillId) {
      setExpandedSkillId(null);
      return;
    }
    setExpandedSkillId(skillId);
    setNewRemark('');
    if (!remarksBySkill[skillId]) {
      setRemarksLoading(true);
      try {
        const result = await workersApi.getRemarks(workerId, skillId);
        setRemarksBySkill((cur) => ({ ...cur, [skillId]: result.remarks }));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Nie udało się wczytać uwag.');
      } finally {
        setRemarksLoading(false);
      }
    }
  }

  async function handleAddRemark(skillId: string) {
    const text = newRemark.trim();
    if (!text) return;
    setSaving(true);
    try {
      await workersApi.addRemark(workerId, skillId, text);
      const result = await workersApi.getRemarks(workerId, skillId);
      setRemarksBySkill((cur) => ({ ...cur, [skillId]: result.remarks }));
      setNewRemark('');
      toast.success('Uwaga dodana.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się dodać uwagi.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="form-card animate-fade-up" style={{ maxWidth: '48rem' }}>
      <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--color-ink)' }}>
        Kompetencje
      </h2>

      <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-ink-muted)' }}>
        Luki kompetencyjne (wymagania stanowiska)
      </h3>
      {gapLoading ? (
        <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.875rem' }}>Ładowanie…</p>
      ) : gaps.length === 0 ? (
        <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
          Brak wymagań do porównania (pracownik bez przypisanego stanowiska lub stanowisko bez wymagań).
        </p>
      ) : (
        <table className="refined-table" style={{ marginBottom: '1.5rem' }}>
          <thead>
            <tr>
              <th>Umiejętność</th>
              <th>Wymagana</th>
              <th>Posiadana</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {gaps.map((g) => (
              <tr key={g.skill_id}>
                <td>{g.skill_description}</td>
                <td>{g.required_rating}</td>
                <td>{g.current_rating ?? '—'}</td>
                <td>
                  <GapBadge gap={g.gap} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-ink-muted)' }}>
        Oceny umiejętności
      </h3>
      {skillsLoading ? (
        <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.875rem' }}>Ładowanie…</p>
      ) : ratings.length === 0 ? (
        <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.875rem', marginBottom: canWrite ? '1rem' : 0 }}>
          Brak ocenionych umiejętności.
        </p>
      ) : (
        <table className="refined-table" style={{ marginBottom: canWrite ? '1rem' : 0 }}>
          <thead>
            <tr>
              <th>Umiejętność</th>
              <th>Ocena</th>
              <th>Aktualizacja</th>
              <th className="text-right">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {ratings.map((r) => (
              <Fragment key={r.skill_id}>
                <tr>
                  <td>{r.skill_description}</td>
                  <td>
                    {canWrite ? (
                      <select
                        className="form-select"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.8125rem' }}
                        value={r.current_rating ?? ''}
                        onChange={(e) => handleUpdateRating(r.skill_id, Number(e.target.value))}
                        disabled={saving}
                        aria-label={`Ocena — ${r.skill_description}`}
                      >
                        {RATING_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      (r.current_rating ?? '—')
                    )}
                  </td>
                  <td>{r.last_update ? new Date(r.last_update).toLocaleDateString('pl-PL') : '—'}</td>
                  <td className="text-right">
                    <div className="action-icons">
                      <button
                        type="button"
                        className="action-icon-btn"
                        title="Uwagi"
                        aria-label={`Uwagi — ${r.skill_description}`}
                        aria-expanded={expandedSkillId === r.skill_id}
                        onClick={() => toggleRemarks(r.skill_id)}
                      >
                        <Icon name="info" />
                      </button>
                      {canWrite && (
                        <button
                          type="button"
                          className="action-icon-btn"
                          title="Usuń ocenę"
                          aria-label={`Usuń ocenę — ${r.skill_description}`}
                          onClick={() => handleRemoveRating(r.skill_id, r.skill_description)}
                          disabled={saving}
                        >
                          <Icon name="delete" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {expandedSkillId === r.skill_id && (
                  <tr>
                    <td colSpan={4} style={{ background: 'var(--color-surface)' }}>
                      <div style={{ padding: '0.75rem 0' }}>
                        {remarksLoading ? (
                          <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.8125rem' }}>Ładowanie uwag…</p>
                        ) : (remarksBySkill[r.skill_id]?.length ?? 0) === 0 ? (
                          <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.8125rem' }}>Brak uwag.</p>
                        ) : (
                          <ul className="space-y-1.5 mb-2">
                            {remarksBySkill[r.skill_id].map((rem) => (
                              <li key={rem.id} style={{ fontSize: '0.8125rem', color: 'var(--color-ink)' }}>
                                <span style={{ color: 'var(--color-ink-subtle)' }}>
                                  {rem.created_at ? new Date(rem.created_at).toLocaleString('pl-PL') : ''}
                                </span>{' '}
                                — {rem.remarks}
                              </li>
                            ))}
                          </ul>
                        )}
                        {canWrite && (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              className="form-input"
                              style={{ flex: 1 }}
                              placeholder="Nowa uwaga…"
                              value={newRemark}
                              onChange={(e) => setNewRemark(e.target.value)}
                              aria-label="Nowa uwaga"
                            />
                            <Button type="button" variant="secondary" small onClick={() => handleAddRemark(r.skill_id)} disabled={!newRemark.trim() || saving}>
                              Dodaj
                            </Button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}

      {canWrite && (
        <div className="flex items-end gap-2">
          <div style={{ flex: 1 }}>
            <label className="form-label">Dodaj ocenę</label>
            <select className="form-select" value={newSkillId} onChange={(e) => setNewSkillId(e.target.value)}>
              <option value="">Wybierz umiejętność…</option>
              {availableSkills.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id} — {s.description}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Ocena</label>
            <select className="form-select" value={newRating} onChange={(e) => setNewRating(Number(e.target.value))}>
              {RATING_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" variant="secondary" onClick={handleAddRating} disabled={!newSkillId || saving}>
            <Icon name="add" size={16} />
            Dodaj
          </Button>
        </div>
      )}
    </div>
  );
}
