import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Icon } from '@/lib/icons/Icon';
import { useApiData } from '@/lib/api/useApiData';
import { bhpApi, type BhpTraining } from '@/lib/api/bhp';
import { useToast } from '@/lib/feedback/ToastProvider';
import { useConfirm } from '@/lib/feedback/ConfirmProvider';
import {
  EXPIRY_STATUS_BADGE_CLASS,
  EXPIRY_STATUS_LABELS,
  expiryRowStatus,
  shouldHighlightAddButton,
  tableHasValidRow,
} from '@/lib/expiryStatus';

// task3 — same rule as WorkerMedicalSection's own copy (see its comment).
const URGENT_ADD_BTN_STYLE: React.CSSProperties = {
  background: 'rgba(155, 44, 44, 0.08)',
  color: 'var(--color-error)',
  borderColor: 'rgba(155, 44, 44, 0.3)',
};

const KIND_OPTIONS: { value: BhpTraining['kind']; label: string }[] = [
  { value: 'Initial', label: 'Wstępne' },
  { value: 'Periodic', label: 'Okresowe' },
  { value: 'Control', label: 'Kontrolne' },
];

const KIND_LABELS: Record<BhpTraining['kind'], string> = {
  Initial: 'Wstępne',
  Periodic: 'Okresowe',
  Control: 'Kontrolne',
};

const EMPTY_DRAFT = { training_date: '', valid_until: '', kind: 'Periodic' as BhpTraining['kind'] };

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleDateString('pl-PL') : '—';
}

/** BHP_4/5 (IMPLEMENTATION_PLAN.md §9) — a worker's BHP trainings, same
 * inline-CRUD shape as WorkerMedicalSection (see its comment for why),
 * minus the `description` field bhp_trainings doesn't have. */
export function WorkerBhpSection({ workerId, canWrite }: { workerId: string; canWrite: boolean }) {
  const { data, loading, reload } = useApiData(() => bhpApi.listForWorker(workerId), [workerId]);
  const toast = useToast();
  const confirm = useConfirm();

  const trainings = useMemo(() => data?.trainings ?? [], [data]);
  const hasValidTraining = useMemo(() => tableHasValidRow(trainings), [trainings]);
  const highlightAdd = useMemo(() => shouldHighlightAddButton(trainings), [trainings]);
  // See WorkerMedicalSection's identical comment — zero rows must stay addable.
  const addEnabled = trainings.length === 0 || highlightAdd;

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  function startAdd() {
    setDraft(EMPTY_DRAFT);
    setAdding(true);
  }

  async function handleAdd() {
    if (!draft.training_date) return;
    setSaving(true);
    try {
      await bhpApi.create(workerId, {
        training_date: draft.training_date,
        valid_until: draft.valid_until || null,
        kind: draft.kind,
      });
      toast.success('Szkolenie dodane.');
      reload();
      setAdding(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się dodać szkolenia.');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(training: BhpTraining) {
    setEditingId(training.id);
    setEditDraft({
      training_date: training.training_date ?? '',
      valid_until: training.valid_until ?? '',
      kind: training.kind,
    });
  }

  async function handleSaveEdit(trainingId: number) {
    if (!editDraft.training_date) return;
    setSaving(true);
    try {
      await bhpApi.update(trainingId, {
        training_date: editDraft.training_date,
        valid_until: editDraft.valid_until || null,
        kind: editDraft.kind,
      });
      toast.success('Szkolenie zaktualizowane.');
      reload();
      setEditingId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się zaktualizować szkolenia.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(training: BhpTraining) {
    const ok = await confirm({
      title: 'Usunąć szkolenie?',
      message: `Szkolenie "${KIND_LABELS[training.kind]}" z dnia ${fmt(training.training_date)} zostanie usunięte.`,
      confirmText: 'Usuń',
      type: 'danger',
    });
    if (!ok) return;
    setSaving(true);
    try {
      await bhpApi.remove(training.id);
      toast.success('Szkolenie usunięte.');
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się usunąć szkolenia.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div id="worker-bhp-section" className="form-card animate-fade-up">
      <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--color-ink)' }}>
        Szkolenia BHP
      </h2>

      {loading ? (
        <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.875rem' }}>Ładowanie…</p>
      ) : trainings.length === 0 && !adding ? (
        <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.875rem', marginBottom: canWrite ? '1rem' : 0 }}>
          Brak zarejestrowanych szkoleń.
        </p>
      ) : (
        <table className="refined-table" style={{ marginBottom: canWrite ? '1rem' : 0 }}>
          <thead>
            <tr>
              <th>Rodzaj</th>
              <th>Data szkolenia</th>
              <th>Ważne do</th>
              <th>Status</th>
              {canWrite && <th className="text-right"><span className="sr-only">Akcje</span></th>}
            </tr>
          </thead>
          <tbody>
            {trainings.map((training) =>
              editingId === training.id ? (
                <tr key={training.id}>
                  <td>
                    <SearchableSelect
                      id={`bhp-edit-kind-${training.id}`}
                      ariaLabel="Rodzaj szkolenia"
                      triggerStyle={{ padding: '0.25rem 0.5rem', fontSize: '0.8125rem' }}
                      options={KIND_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
                      value={editDraft.kind}
                      onChange={(v) => setEditDraft((d) => ({ ...d, kind: v as BhpTraining['kind'] }))}
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      className="form-input"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.8125rem' }}
                      value={editDraft.training_date}
                      onChange={(e) => setEditDraft((d) => ({ ...d, training_date: e.target.value }))}
                      aria-label="Data szkolenia"
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      className="form-input"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.8125rem' }}
                      value={editDraft.valid_until}
                      onChange={(e) => setEditDraft((d) => ({ ...d, valid_until: e.target.value }))}
                      aria-label="Ważne do"
                    />
                  </td>
                  <td>
                    <span className={`refined-badge ${EXPIRY_STATUS_BADGE_CLASS[expiryRowStatus(training.valid_until, hasValidTraining)]}`}>
                      {EXPIRY_STATUS_LABELS[expiryRowStatus(training.valid_until, hasValidTraining)]}
                    </span>
                  </td>
                  <td className="text-right">
                    <div className="action-icons">
                      <Button type="button" variant="secondary" small onClick={() => handleSaveEdit(training.id)} disabled={saving || !editDraft.training_date}>
                        Zapisz
                      </Button>
                      <Button type="button" variant="secondary" small onClick={() => setEditingId(null)} disabled={saving}>
                        Anuluj
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={training.id}>
                  <td>{KIND_LABELS[training.kind]}</td>
                  <td>{fmt(training.training_date)}</td>
                  <td>{fmt(training.valid_until)}</td>
                  <td>
                    <span className={`refined-badge ${EXPIRY_STATUS_BADGE_CLASS[expiryRowStatus(training.valid_until, hasValidTraining)]}`}>
                      {EXPIRY_STATUS_LABELS[expiryRowStatus(training.valid_until, hasValidTraining)]}
                    </span>
                  </td>
                  {canWrite && (
                    <td className="text-right">
                      <div className="action-icons">
                        <button type="button" className="action-icon-btn" title="Edytuj" aria-label="Edytuj szkolenie" onClick={() => startEdit(training)}>
                          <Icon name="edit" />
                        </button>
                        <button type="button" className="action-icon-btn" title="Usuń" aria-label="Usuń szkolenie" onClick={() => handleDelete(training)} disabled={saving}>
                          <Icon name="delete" />
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

      {canWrite && adding && (
        <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: '1fr 1fr 1fr auto', alignItems: 'end' }}>
          <div>
            <SearchableSelect
              id="bhp-add-kind"
              label="Rodzaj"
              options={KIND_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
              value={draft.kind}
              onChange={(v) => setDraft((d) => ({ ...d, kind: v as BhpTraining['kind'] }))}
            />
          </div>
          <div>
            <label className="form-label">Data szkolenia</label>
            <input type="date" className="form-input" value={draft.training_date} onChange={(e) => setDraft((d) => ({ ...d, training_date: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Ważne do</label>
            <input type="date" className="form-input" value={draft.valid_until} onChange={(e) => setDraft((d) => ({ ...d, valid_until: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="primary" small onClick={handleAdd} disabled={saving || !draft.training_date}>
              Dodaj
            </Button>
            <Button type="button" variant="secondary" small onClick={() => setAdding(false)} disabled={saving}>
              Anuluj
            </Button>
          </div>
        </div>
      )}

      {canWrite && !adding && (
        <Button
          type="button"
          variant="secondary"
          onClick={startAdd}
          disabled={!addEnabled}
          style={highlightAdd ? URGENT_ADD_BTN_STYLE : undefined}
          title={addEnabled ? undefined : 'Aktualne szkolenie jest wciąż ważne'}
        >
          <Icon name="add" size={16} />
          Dodaj szkolenie
        </Button>
      )}
    </div>
  );
}
