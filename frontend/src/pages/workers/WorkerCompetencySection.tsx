import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Icon } from '@/lib/icons/Icon';
import { useApiData } from '@/lib/api/useApiData';
import { workersApi, type SkillGap, type WorkerSkillItem } from '@/lib/api/workers';
import { skillsApi } from '@/lib/api/skills';
import { useToast } from '@/lib/feedback/ToastProvider';
import { useConfirm } from '@/lib/feedback/ConfirmProvider';

const RATING_OPTIONS = [1, 2, 3];

// Tier color class per rating — see .rating-pill-0/1/2/3 in components.css.
// 0 is the "brak oceny" sentinel (never a real worker_skills.current_rating,
// which is always 1-3) — RatingPill renders it as a dashed placeholder pill
// rather than picking from RATING_OPTIONS, since choosing a value from a
// rating=0 row means *creating* the rating (POST), not editing one (PUT).
const RATING_TIER_CLASS: Record<number, string> = { 0: 'rating-pill-0', 1: 'rating-pill-1', 2: 'rating-pill-2', 3: 'rating-pill-3' };

/** Read-only (!canWrite) text for a rating — the interactive RatingPill
 * shows the literal 0 sentinel (simpler: no options/placeholder juggling),
 * but a plain-text viewer would misread a bare "0" as an actual low rating
 * rather than "not yet rated", so this collapses it to an em-dash instead. */
function formatRating(rating: number): string {
  return rating === 0 ? '—' : String(rating);
}

function GapBadge({ gap }: { gap: number }) {
  if (gap <= 0) return <span className="status-badge active">Spełnia</span>;
  return <span className="status-badge inactive">Luka: {gap}</span>;
}

/** The "Ocena" cell as a small tactile pill (.rating-pill, same bordered/
 * hover/pop language as .permission-tile) instead of a bare inline select —
 * gives the editable value its own visual weight without turning the whole
 * row into a card (rows stay `.refined-table` rows: sortable-page
 * consistency + column scanability, see the design discussion this
 * replaced). Pulses (reusing `tile-check-pop`, same trick as StatusBadge)
 * whenever `rating` changes after mount, so a save gets the same "yes, that
 * registered" feedback a full reload would give for free.
 *
 * `rating` is always 0-3, never null — 0 means this skill has no
 * worker_skills row yet (a job-required skill nobody's rated). The trigger
 * has no option for 0 (RATING_OPTIONS is still just 1-3, the only real
 * ratings); it shows via `placeholder="0"`, the same fallback SearchableSelect
 * already uses when `value` matches no option. */
function RatingPill({
  skillId,
  skillDescription,
  rating,
  onChange,
  disabled,
}: {
  skillId: string;
  skillDescription: string;
  rating: number;
  onChange: (value: number) => void;
  disabled: boolean;
}) {
  const prevRating = useRef(rating);
  const [pulsing, setPulsing] = useState(false);

  useEffect(() => {
    if (prevRating.current === rating) return;
    prevRating.current = rating;
    setPulsing(true);
    const t = window.setTimeout(() => setPulsing(false), 250);
    return () => window.clearTimeout(t);
  }, [rating]);

  return (
    <SearchableSelect
      id={`competency-rating-${skillId}`}
      ariaLabel={`Ocena — ${skillDescription}`}
      fullWidth={false}
      placeholder="0"
      triggerClassName={`rating-pill ${RATING_TIER_CLASS[rating]}${pulsing ? ' rating-pill-pulse' : ''}`}
      triggerStyle={{ gap: '0.25rem', padding: '0.25rem 0.4rem' }}
      options={RATING_OPTIONS.map((opt) => ({ value: String(opt), label: String(opt) }))}
      value={String(rating)}
      onChange={(v) => onChange(Number(v))}
      disabled={disabled}
    />
  );
}

/** SKL_2/3/4 — a worker's actual skill ratings (editable), per-rating
 * remarks history (SKL_3, append-only — see worker_skill_remarks' own
 * comment for why there's no edit/delete), and the gap-vs-job-requirements
 * table (SKL_4). Rendered as one more stacked Section on WorkerViewPage —
 * the plan calls this a "zakładka" (tab), but this app has no tab
 * component anywhere else; a Section card matches the page's existing
 * pattern instead of introducing a one-off new interaction idiom. */
/** One row of the merged Kompetencje table — joins WorkerSkillItem (an
 * actual rating) and SkillGap (a job requirement) on skill_id. A skill can
 * be either, both, or (transiently, mid-load) neither; `hasRating` is what
 * every write action branches on (POST a new worker_skills row vs PUT the
 * existing one; remarks/history/delete only exist once a row does). */
interface UnifiedSkillRow {
  skill_id: string;
  skill_description: string;
  required_rating: number | null;
  current_rating: number;
  gap: number | null;
  last_update: string | null;
  hasRating: boolean;
}

/** Merges `ratings` + `gaps` into one row per skill, sorted gap-first (a
 * required skill with an unmet/missing rating), then requirements already
 * met, then skills rated but not required by the job — mirrors the
 * "surface what needs attention first" convention WorkerAttentionSection/
 * ActionPlansPage already use elsewhere on this page. */
function mergeSkillRows(ratings: WorkerSkillItem[], gaps: SkillGap[]): UnifiedSkillRow[] {
  const bySkill = new Map<string, UnifiedSkillRow>();
  for (const r of ratings) {
    bySkill.set(r.skill_id, {
      skill_id: r.skill_id,
      skill_description: r.skill_description,
      required_rating: null,
      current_rating: r.current_rating ?? 0,
      gap: null,
      last_update: r.last_update,
      hasRating: true,
    });
  }
  for (const g of gaps) {
    const existing = bySkill.get(g.skill_id);
    if (existing) {
      existing.required_rating = g.required_rating;
      existing.gap = g.gap;
    } else {
      bySkill.set(g.skill_id, {
        skill_id: g.skill_id,
        skill_description: g.skill_description,
        required_rating: g.required_rating,
        current_rating: 0,
        gap: g.gap,
        last_update: null,
        hasRating: false,
      });
    }
  }

  function rank(row: UnifiedSkillRow): number {
    if (row.required_rating != null && (row.gap ?? 0) > 0) return 0;
    if (row.required_rating != null) return 1;
    return 2;
  }

  return Array.from(bySkill.values()).sort((a, b) => rank(a) - rank(b) || a.skill_description.localeCompare(b.skill_description, 'pl'));
}

export function WorkerCompetencySection({ workerId, canWrite }: { workerId: string; canWrite: boolean }) {
  const { data: skillsData, loading: skillsLoading, reload: reloadSkills } = useApiData(() => workersApi.getSkills(workerId), [workerId]);
  const { data: gapData, loading: gapLoading } = useApiData(() => workersApi.getGapAnalysis(workerId), [workerId, skillsData]);
  const { data: allSkillsData } = useApiData(() => skillsApi.list());
  const toast = useToast();
  const confirm = useConfirm();

  const ratings = useMemo(() => skillsData?.skills ?? [], [skillsData]);
  const gaps = useMemo(() => gapData?.gaps ?? [], [gapData]);
  const rows = useMemo(() => mergeSkillRows(ratings, gaps), [ratings, gaps]);
  const loading = skillsLoading || gapLoading;

  const [newSkillId, setNewSkillId] = useState('');
  const [newRating, setNewRating] = useState(2);
  const [saving, setSaving] = useState(false);
  const [expandedSkillId, setExpandedSkillId] = useState<string | null>(null);
  const [remarksBySkill, setRemarksBySkill] = useState<Record<string, { id: number; remarks: string; created_at: string | null }[]>>({});
  const [remarksLoading, setRemarksLoading] = useState(false);
  const [newRemark, setNewRemark] = useState('');
  const [ratingHistoryBySkill, setRatingHistoryBySkill] = useState<
    Record<string, { id: number; action: string; old_value: string | null; new_value: string | null; user_name: string | null; timestamp: string | null }[]>
  >({});

  const availableSkills = useMemo(
    () => (allSkillsData?.skills ?? []).filter((s) => !ratings.some((r) => r.skill_id === s.id)),
    [allSkillsData, ratings],
  );

  /** Single write path for both the footer "Dodaj ocenę" form and a
   * unified-row RatingPill: `hasRating` decides POST (new worker_skills
   * row — a job-required skill nobody's rated yet, or the footer's own
   * arbitrary-skill picker) vs PUT (editing an existing rating). Returns
   * whether it succeeded so callers can decide whether to reset their own
   * local form state. */
  async function handleRateSkill(skillId: string, hasRating: boolean, rating: number): Promise<boolean> {
    setSaving(true);
    try {
      if (hasRating) {
        await workersApi.updateSkill(workerId, skillId, rating, new Date().toISOString().slice(0, 10));
        toast.success('Ocena zaktualizowana.');
      } else {
        await workersApi.setSkill(workerId, skillId, rating, new Date().toISOString().slice(0, 10));
        toast.success('Ocena dodana.');
      }
      reloadSkills();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się zapisać oceny.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleAddRating() {
    if (!newSkillId) return;
    const ok = await handleRateSkill(newSkillId, false, newRating);
    if (ok) {
      setNewSkillId('');
      setNewRating(2);
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
    if (!ratingHistoryBySkill[skillId]) {
      try {
        const result = await workersApi.getRatingHistory(workerId, skillId);
        setRatingHistoryBySkill((cur) => ({ ...cur, [skillId]: result.events }));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Nie udało się wczytać historii oceny.');
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
    <div className="form-card animate-fade-up">
      <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--color-ink)' }}>
        Kompetencje
      </h2>

      {loading ? (
        <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.875rem' }}>Ładowanie…</p>
      ) : rows.length === 0 ? (
        <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.875rem', marginBottom: canWrite ? '1rem' : 0 }}>
          Brak umiejętności — pracownik nie ma wymagań stanowiska ani ocenionych umiejętności.
        </p>
      ) : (
        <table className="refined-table" style={{ marginBottom: canWrite ? '1rem' : 0 }}>
          <thead>
            <tr>
              <th>Umiejętność</th>
              <th>Wymagana</th>
              <th>Ocena</th>
              <th>Status</th>
              <th>Aktualizacja</th>
              <th className="text-right"><span className="sr-only">Akcje</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Fragment key={row.skill_id}>
                <tr>
                  <td>{row.skill_description}</td>
                  <td>{row.required_rating ?? '—'}</td>
                  <td>
                    {canWrite ? (
                      <RatingPill
                        skillId={row.skill_id}
                        skillDescription={row.skill_description}
                        rating={row.current_rating}
                        onChange={(v) => handleRateSkill(row.skill_id, row.hasRating, v)}
                        disabled={saving}
                      />
                    ) : (
                      formatRating(row.current_rating)
                    )}
                  </td>
                  <td>{row.required_rating != null && row.gap != null ? <GapBadge gap={row.gap} /> : '—'}</td>
                  <td>{row.last_update ? new Date(row.last_update).toLocaleDateString('pl-PL') : '—'}</td>
                  <td className="text-right">
                    {row.hasRating ? (
                      <div className="action-icons">
                        <button
                          type="button"
                          className="action-icon-btn"
                          title="Uwagi i historia oceny"
                          aria-label={`Uwagi i historia oceny — ${row.skill_description}`}
                          aria-expanded={expandedSkillId === row.skill_id}
                          onClick={() => toggleRemarks(row.skill_id)}
                        >
                          <Icon name="info" />
                        </button>
                        {canWrite && (
                          <button
                            type="button"
                            className="action-icon-btn"
                            title="Usuń ocenę"
                            aria-label={`Usuń ocenę — ${row.skill_description}`}
                            onClick={() => handleRemoveRating(row.skill_id, row.skill_description)}
                            disabled={saving}
                          >
                            <Icon name="delete" />
                          </button>
                        )}
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
                {row.hasRating && expandedSkillId === row.skill_id && (
                  <tr>
                    <td colSpan={6} style={{ background: 'var(--color-surface)' }}>
                      <div style={{ padding: '0.75rem 0' }}>
                        <h4 className="text-xs font-semibold mb-1.5" style={{ color: 'var(--color-ink-muted)' }}>
                          Historia oceny
                        </h4>
                        {(ratingHistoryBySkill[row.skill_id]?.length ?? 0) === 0 ? (
                          <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>Brak historii zmian oceny.</p>
                        ) : (
                          <ul className="space-y-1.5 mb-3">
                            {ratingHistoryBySkill[row.skill_id].map((ev) => (
                              <li key={ev.id} style={{ fontSize: '0.8125rem', color: 'var(--color-ink)' }}>
                                <span style={{ color: 'var(--color-ink-subtle)' }}>
                                  {ev.timestamp ? new Date(ev.timestamp).toLocaleString('pl-PL') : ''} — {ev.user_name ?? 'System'}:
                                </span>{' '}
                                {ev.old_value ?? '—'} → {ev.new_value ?? '—'}
                              </li>
                            ))}
                          </ul>
                        )}
                        <h4 className="text-xs font-semibold mb-1.5" style={{ color: 'var(--color-ink-muted)' }}>
                          Uwagi
                        </h4>
                        {remarksLoading ? (
                          <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.8125rem' }}>Ładowanie uwag…</p>
                        ) : (remarksBySkill[row.skill_id]?.length ?? 0) === 0 ? (
                          <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.8125rem' }}>Brak uwag.</p>
                        ) : (
                          <ul className="space-y-1.5 mb-2">
                            {remarksBySkill[row.skill_id].map((rem) => (
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
                            <Button
                              type="button"
                              variant="secondary"
                              small
                              onClick={() => handleAddRemark(row.skill_id)}
                              disabled={!newRemark.trim() || saving}
                            >
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
            <SearchableSelect
              id="competency-add-skill"
              label="Dodaj ocenę"
              placeholder="Wybierz umiejętność…"
              options={availableSkills.map((s) => ({ value: s.id, label: `${s.id} — ${s.description}` }))}
              value={newSkillId}
              onChange={setNewSkillId}
            />
          </div>
          <div>
            <SearchableSelect
              id="competency-add-rating"
              label="Ocena"
              options={RATING_OPTIONS.map((r) => ({ value: String(r), label: String(r) }))}
              value={String(newRating)}
              onChange={(v) => setNewRating(Number(v))}
            />
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
