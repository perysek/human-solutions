import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Icon } from '@/lib/icons/Icon';
import { useApiData } from '@/lib/api/useApiData';
import { trainingsApi, type TrainingParticipant } from '@/lib/api/trainings';
import { workersApi } from '@/lib/api/workers';
import { useToast } from '@/lib/feedback/ToastProvider';
import { useConfirm } from '@/lib/feedback/ConfirmProvider';

const EMPTY_DRAFT = { worker_id: '', trainer_id: '', start_date: '', finish_date: '', remarks: '' };

interface RowDraft {
  trainer_id: string;
  start_date: string;
  finish_date: string;
  remarks: string;
  effectiveness_date: string;
}

function draftFromParticipant(p: TrainingParticipant): RowDraft {
  return {
    trainer_id: p.trainer_id ?? '',
    start_date: p.start_date ?? '',
    finish_date: p.finish_date ?? '',
    remarks: p.remarks ?? '',
    effectiveness_date: p.effectiveness_date ?? '',
  };
}

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleDateString('pl-PL') : '—';
}

/** Comparison-only normalization — mirrors handleSaveRow's own
 * `remarks.trim()` so a draft that only differs from the last-saved
 * participant by leading/trailing whitespace doesn't read as "dirty"
 * forever (the server never echoes back the untrimmed value, so a raw
 * draft/participant comparison would never resolve to equal). */
function normalizeForCompare(d: RowDraft): RowDraft {
  return { ...d, remarks: d.remarks.trim() };
}

interface ParticipantsTableProps {
  trainingId: number;
  participants: TrainingParticipant[];
  loading: boolean;
  reload: () => void;
  canManage: boolean;
}

/** TRN_5/8/9/11 — a training's roster. `canManage` is computed by the
 * caller (TrainingViewPage) from the same participants list this component
 * renders — both need it (the page's Edit button, this table's add/edit
 * controls), so it's fetched once and shared rather than duplicated here.
 *
 * Cells are always editable (click straight in, Tab to the next) rather
 * than needing a separate "enter edit mode" step — one local draft per row,
 * keyed by participant id, keeps typed-but-unsaved values across re-renders
 * (including the reload() a *different* row's save triggers) without
 * clobbering them; nothing reaches the server until that row's own Save
 * icon is clicked. Viewers (`!canManage`) still get the old read-only text
 * cells — there's nothing for them to edit. */
export function ParticipantsTable({ trainingId, participants, loading, reload, canManage }: ParticipantsTableProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data: workersData } = useApiData(() => workersApi.list({ status: 'active', sort: 'surname', page_size: 200 }));

  const canExport = canManage;

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [drafts, setDrafts] = useState<Record<number, RowDraft>>({});
  const [saving, setSaving] = useState(false);
  // Brief "just saved" flash on a row's Save icon, cleared either by the
  // timeout below or immediately by the row's next edit (updateDraft) —
  // whichever comes first. Separate from isDirty (computed per-row further
  // down by comparing the draft to the current participant) since a flash
  // and "unsaved changes" are mutually exclusive but neither implies the
  // other structurally.
  const [savedFlash, setSavedFlash] = useState<Record<number, boolean>>({});
  const flashTimeouts = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  useEffect(() => {
    const timeouts = flashTimeouts.current;
    return () => {
      Object.values(timeouts).forEach(clearTimeout);
    };
  }, []);

  const workerOptions = useMemo(
    () => (workersData?.workers ?? []).map((w) => ({ value: w.id, label: `${w.surname} ${w.firstname}` })),
    [workersData],
  );
  const trainerOptions = useMemo(() => [{ value: '', label: '—' }, ...workerOptions], [workerOptions]);

  // Seed a draft for every participant that doesn't have one yet (new rows,
  // or the very first render) — never overwrite one that already exists, so
  // a reload() from adding/deleting/saving a *different* row can't wipe out
  // this row's in-progress, unsaved edits. Rows whose participant is gone
  // (deleted) are dropped since they're simply not in `participants` anymore.
  useEffect(() => {
    setDrafts((cur) => {
      const next: Record<number, RowDraft> = {};
      for (const p of participants) {
        next[p.id] = cur[p.id] ?? draftFromParticipant(p);
      }
      return next;
    });
  }, [participants]);

  function updateDraft(id: number, patch: Partial<RowDraft>) {
    setDrafts((cur) => ({ ...cur, [id]: { ...cur[id], ...patch } }));
    setSavedFlash((cur) => (cur[id] ? { ...cur, [id]: false } : cur));
  }

  function startAdd() {
    setDraft(EMPTY_DRAFT);
    setAdding(true);
  }

  async function handleAdd() {
    if (!draft.worker_id) return;
    setSaving(true);
    try {
      await trainingsApi.addParticipant(trainingId, {
        worker_id: draft.worker_id,
        trainer_id: draft.trainer_id || null,
        start_date: draft.start_date || null,
        finish_date: draft.finish_date || null,
        remarks: draft.remarks.trim() || null,
      });
      toast.success('Uczestnik dodany.');
      reload();
      setAdding(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się dodać uczestnika.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(p: TrainingParticipant) {
    const ok = await confirm({
      title: 'Usunąć uczestnika?',
      message: `Uczestnik "${p.worker_name}" zostanie usunięty z listy uczestników tego szkolenia.`,
      confirmText: 'Usuń',
      type: 'danger',
    });
    if (!ok) return;
    setSaving(true);
    try {
      await trainingsApi.removeParticipant(p.id);
      toast.success('Uczestnik usunięty.');
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się usunąć uczestnika.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveRow(participantId: number) {
    const d = drafts[participantId];
    if (!d) return;
    setSaving(true);
    try {
      await trainingsApi.updateParticipant(participantId, {
        trainer_id: d.trainer_id || null,
        start_date: d.start_date || null,
        finish_date: d.finish_date || null,
        remarks: d.remarks.trim() || null,
        effectiveness_date: d.effectiveness_date || null,
      });
      toast.success('Uczestnik zaktualizowany.');
      reload();
      setSavedFlash((cur) => ({ ...cur, [participantId]: true }));
      clearTimeout(flashTimeouts.current[participantId]);
      flashTimeouts.current[participantId] = setTimeout(() => {
        setSavedFlash((cur) => ({ ...cur, [participantId]: false }));
      }, 2000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się zaktualizować uczestnika.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="form-card animate-fade-up" style={{ maxWidth: '64rem' }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold" style={{ color: 'var(--color-ink)' }}>
          Uczestnicy
        </h2>
        {canExport && participants.length > 0 && (
          <a href={trainingsApi.exportUrl(trainingId)} className="form-btn-secondary" style={{ textDecoration: 'none' }}>
            <Icon name="download" size={16} />
            Eksportuj CSV
          </a>
        )}
      </div>

      {loading ? (
        <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.875rem' }}>Ładowanie…</p>
      ) : participants.length === 0 && !adding ? (
        <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.875rem', marginBottom: canManage ? '1rem' : 0 }}>Brak uczestników.</p>
      ) : (
        <table className="refined-table" style={{ marginBottom: canManage ? '1rem' : 0 }}>
          <thead>
            <tr>
              <th>Pracownik</th>
              <th>Data rozpoczęcia</th>
              <th>Data zakończenia</th>
              <th>Trener</th>
              <th>Skuteczność</th>
              <th>Uwagi</th>
              {canManage && <th className="text-right">Akcje</th>}
            </tr>
          </thead>
          <tbody>
            {participants.map((p) => {
              const d = drafts[p.id] ?? draftFromParticipant(p);
              // Compares the live draft against the participant as last
              // confirmed from the server (not a separate "original"
              // snapshot) — see the drafts-seeding effect above for why
              // that's the right baseline: it only overwrites a row's draft
              // when there wasn't one yet, so `p` itself stays the
              // source of truth for "last saved" between edits.
              const isDirty = JSON.stringify(normalizeForCompare(d)) !== JSON.stringify(normalizeForCompare(draftFromParticipant(p)));
              const saveStatus: 'saved' | 'dirty' | 'idle' = savedFlash[p.id] ? 'saved' : isDirty ? 'dirty' : 'idle';
              return (
                <tr key={p.id}>
                  <td>{p.worker_name}</td>
                  <td>
                    {canManage ? (
                      <input
                        type="date"
                        className="cell-edit-input"
                        value={d.start_date}
                        onChange={(e) => updateDraft(p.id, { start_date: e.target.value })}
                        aria-label={`Data rozpoczęcia — ${p.worker_name}`}
                      />
                    ) : (
                      fmt(p.start_date)
                    )}
                  </td>
                  <td>
                    {canManage ? (
                      <input
                        type="date"
                        className="cell-edit-input"
                        value={d.finish_date}
                        onChange={(e) => updateDraft(p.id, { finish_date: e.target.value })}
                        aria-label={`Data zakończenia — ${p.worker_name}`}
                      />
                    ) : (
                      fmt(p.finish_date)
                    )}
                  </td>
                  <td>
                    {canManage ? (
                      <SearchableSelect
                        id={`participant-trainer-${p.id}`}
                        ariaLabel={`Trener — ${p.worker_name}`}
                        triggerClassName="cell-edit-input"
                        options={trainerOptions}
                        value={d.trainer_id}
                        onChange={(v) => updateDraft(p.id, { trainer_id: v })}
                      />
                    ) : (
                      (p.trainer_name ?? '—')
                    )}
                  </td>
                  <td>
                    {canManage ? (
                      <input
                        type="date"
                        className="cell-edit-input"
                        value={d.effectiveness_date}
                        onChange={(e) => updateDraft(p.id, { effectiveness_date: e.target.value })}
                        aria-label={`Data oceny skuteczności — ${p.worker_name}`}
                      />
                    ) : (
                      fmt(p.effectiveness_date)
                    )}
                  </td>
                  <td>
                    {canManage ? (
                      <input
                        type="text"
                        className="cell-edit-input"
                        value={d.remarks}
                        onChange={(e) => updateDraft(p.id, { remarks: e.target.value })}
                        aria-label={`Uwagi — ${p.worker_name}`}
                      />
                    ) : (
                      (p.remarks ?? '—')
                    )}
                  </td>
                  {canManage && (
                    <td className="text-right">
                      <div className="action-icons">
                        <button
                          type="button"
                          className="action-icon-btn danger-reveal"
                          title="Usuń"
                          aria-label={`Usuń uczestnika ${p.worker_name}`}
                          onClick={() => handleDelete(p)}
                          disabled={saving}
                        >
                          <Icon name="delete" />
                        </button>
                        <button
                          type="button"
                          className={`action-icon-btn${saveStatus === 'idle' ? '' : ` save-status-${saveStatus}`}`}
                          title={saveStatus === 'dirty' ? 'Niezapisane zmiany — zapisz' : saveStatus === 'saved' ? 'Zapisano' : 'Zapisz'}
                          aria-label={`Zapisz uczestnika ${p.worker_name}${saveStatus === 'dirty' ? ' (niezapisane zmiany)' : ''}`}
                          onClick={() => handleSaveRow(p.id)}
                          disabled={saving}
                        >
                          <Icon name="save" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {canManage && adding && (
        <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr auto', alignItems: 'end' }}>
          <div>
            <SearchableSelect
              id="participant-add-worker"
              label="Pracownik"
              options={workerOptions}
              value={draft.worker_id}
              onChange={(v) => setDraft((d) => ({ ...d, worker_id: v }))}
            />
          </div>
          <div>
            <SearchableSelect
              id="participant-add-trainer"
              label="Trener"
              options={trainerOptions}
              value={draft.trainer_id}
              onChange={(v) => setDraft((d) => ({ ...d, trainer_id: v }))}
            />
          </div>
          <div>
            <label className="form-label">Data rozpoczęcia</label>
            <input type="date" className="form-input" value={draft.start_date} onChange={(e) => setDraft((d) => ({ ...d, start_date: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Data zakończenia</label>
            <input type="date" className="form-input" value={draft.finish_date} onChange={(e) => setDraft((d) => ({ ...d, finish_date: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Uwagi</label>
            <input type="text" className="form-input" value={draft.remarks} onChange={(e) => setDraft((d) => ({ ...d, remarks: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="primary" small onClick={handleAdd} disabled={saving || !draft.worker_id}>
              Dodaj
            </Button>
            <Button type="button" variant="secondary" small onClick={() => setAdding(false)} disabled={saving}>
              Anuluj
            </Button>
          </div>
        </div>
      )}

      {canManage && !adding && (
        <Button type="button" variant="secondary" onClick={startAdd}>
          <Icon name="add" size={16} />
          Dodaj uczestnika
        </Button>
      )}
    </div>
  );
}
