import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { SelectWrap } from '@/components/ui/SelectWrap';
import { Icon } from '@/lib/icons/Icon';
import { useApiData } from '@/lib/api/useApiData';
import { trainingsApi, type TrainingParticipant } from '@/lib/api/trainings';
import { workersApi } from '@/lib/api/workers';
import { useToast } from '@/lib/feedback/ToastProvider';
import { useConfirm } from '@/lib/feedback/ConfirmProvider';

const EMPTY_DRAFT = { worker_id: '', trainer_id: '', start_date: '', finish_date: '', remarks: '' };

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleDateString('pl-PL') : '—';
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
 * controls), so it's fetched once and shared rather than duplicated here. */
export function ParticipantsTable({ trainingId, participants, loading, reload, canManage }: ParticipantsTableProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data: workersData } = useApiData(() => workersApi.list({ status: 'active', sort: 'surname', page_size: 200 }));

  const canExport = canManage;

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState({ trainer_id: '', start_date: '', finish_date: '', remarks: '', effectiveness_date: '' });
  const [saving, setSaving] = useState(false);

  const workerOptions = useMemo(
    () => (workersData?.workers ?? []).map((w) => ({ value: w.id, label: `${w.surname} ${w.firstname}` })),
    [workersData],
  );

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

  function startEdit(p: TrainingParticipant) {
    setEditingId(p.id);
    setEditDraft({
      trainer_id: p.trainer_id ?? '',
      start_date: p.start_date ?? '',
      finish_date: p.finish_date ?? '',
      remarks: p.remarks ?? '',
      effectiveness_date: p.effectiveness_date ?? '',
    });
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
      if (editingId === p.id) setEditingId(null);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się usunąć uczestnika.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit(participantId: number) {
    setSaving(true);
    try {
      await trainingsApi.updateParticipant(participantId, {
        trainer_id: editDraft.trainer_id || null,
        start_date: editDraft.start_date || null,
        finish_date: editDraft.finish_date || null,
        remarks: editDraft.remarks.trim() || null,
        effectiveness_date: editDraft.effectiveness_date || null,
      });
      toast.success('Uczestnik zaktualizowany.');
      reload();
      setEditingId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się zaktualizować uczestnika.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="form-card animate-fade-up" style={{ maxWidth: '64rem', margin: '0 auto' }}>
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
            {participants.map((p) =>
              editingId === p.id ? (
                <tr key={p.id}>
                  <td>{p.worker_name}</td>
                  <td>
                    <input
                      type="date"
                      className="form-input"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.8125rem' }}
                      value={editDraft.start_date}
                      onChange={(e) => setEditDraft((d) => ({ ...d, start_date: e.target.value }))}
                      aria-label="Data rozpoczęcia"
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      className="form-input"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.8125rem' }}
                      value={editDraft.finish_date}
                      onChange={(e) => setEditDraft((d) => ({ ...d, finish_date: e.target.value }))}
                      aria-label="Data zakończenia"
                    />
                  </td>
                  <td>
                    <SelectWrap>
                      <select
                        className="form-select"
                        style={{ padding: '0.25rem 1.75rem 0.25rem 0.5rem', fontSize: '0.8125rem' }}
                        value={editDraft.trainer_id}
                        onChange={(e) => setEditDraft((d) => ({ ...d, trainer_id: e.target.value }))}
                        aria-label="Trener"
                      >
                        <option value="">—</option>
                        {workerOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </SelectWrap>
                  </td>
                  <td>
                    <input
                      type="date"
                      className="form-input"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.8125rem' }}
                      value={editDraft.effectiveness_date}
                      onChange={(e) => setEditDraft((d) => ({ ...d, effectiveness_date: e.target.value }))}
                      aria-label="Data oceny skuteczności"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      className="form-input"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.8125rem' }}
                      value={editDraft.remarks}
                      onChange={(e) => setEditDraft((d) => ({ ...d, remarks: e.target.value }))}
                      aria-label="Uwagi"
                    />
                  </td>
                  <td className="text-right">
                    <div className="action-icons">
                      <Button type="button" variant="secondary" small onClick={() => handleSaveEdit(p.id)} disabled={saving}>
                        Zapisz
                      </Button>
                      <Button type="button" variant="secondary" small onClick={() => setEditingId(null)} disabled={saving}>
                        Anuluj
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={p.id}>
                  <td>{p.worker_name}</td>
                  <td>{fmt(p.start_date)}</td>
                  <td>{fmt(p.finish_date)}</td>
                  <td>{p.trainer_name ?? '—'}</td>
                  <td>{fmt(p.effectiveness_date)}</td>
                  <td>{p.remarks ?? '—'}</td>
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
                        <button type="button" className="action-icon-btn" title="Edytuj" aria-label={`Edytuj uczestnika ${p.worker_name}`} onClick={() => startEdit(p)}>
                          <Icon name="edit" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}

      {canManage && adding && (
        <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr auto', alignItems: 'end' }}>
          <div>
            <label className="form-label">Pracownik</label>
            <SelectWrap>
              <select className="form-select" value={draft.worker_id} onChange={(e) => setDraft((d) => ({ ...d, worker_id: e.target.value }))}>
                <option value="">Wybierz…</option>
                {workerOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </SelectWrap>
          </div>
          <div>
            <label className="form-label">Trener</label>
            <SelectWrap>
              <select className="form-select" value={draft.trainer_id} onChange={(e) => setDraft((d) => ({ ...d, trainer_id: e.target.value }))}>
                <option value="">—</option>
                {workerOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </SelectWrap>
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
