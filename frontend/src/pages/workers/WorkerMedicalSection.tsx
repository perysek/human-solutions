import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Icon } from '@/lib/icons/Icon';
import { useApiData } from '@/lib/api/useApiData';
import { medicalApi, type MedicalExam } from '@/lib/api/medical';
import { useToast } from '@/lib/feedback/ToastProvider';
import { useConfirm } from '@/lib/feedback/ConfirmProvider';

const KIND_OPTIONS: { value: MedicalExam['kind']; label: string }[] = [
  { value: 'Preliminary', label: 'Wstępne' },
  { value: 'Periodic', label: 'Okresowe' },
];

const KIND_LABELS: Record<MedicalExam['kind'], string> = {
  Preliminary: 'Wstępne',
  Periodic: 'Okresowe',
};

const EMPTY_DRAFT = { description: '', performed_on: '', valid_until: '', kind: 'Periodic' as MedicalExam['kind'] };

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleDateString('pl-PL') : '—';
}

/** MED_5/6 (IMPLEMENTATION_PLAN.md §9) — a worker's medical exams, full
 * CRUD inline (no modal component in this app — see WorkerCompetencySection's
 * own comment on why a Section card + inline row editing is the established
 * idiom here rather than a one-off new interaction pattern). */
export function WorkerMedicalSection({ workerId, canWrite }: { workerId: string; canWrite: boolean }) {
  const { data, loading, reload } = useApiData(() => medicalApi.listForWorker(workerId), [workerId]);
  const toast = useToast();
  const confirm = useConfirm();

  const exams = data?.exams ?? [];

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
    if (!draft.performed_on) return;
    setSaving(true);
    try {
      await medicalApi.create(workerId, {
        description: draft.description.trim() || null,
        performed_on: draft.performed_on,
        valid_until: draft.valid_until || null,
        kind: draft.kind,
      });
      toast.success('Badanie dodane.');
      reload();
      setAdding(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się dodać badania.');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(exam: MedicalExam) {
    setEditingId(exam.id);
    setEditDraft({
      description: exam.description ?? '',
      performed_on: exam.performed_on ?? '',
      valid_until: exam.valid_until ?? '',
      kind: exam.kind,
    });
  }

  async function handleSaveEdit(examId: number) {
    if (!editDraft.performed_on) return;
    setSaving(true);
    try {
      await medicalApi.update(examId, {
        description: editDraft.description.trim() || null,
        performed_on: editDraft.performed_on,
        valid_until: editDraft.valid_until || null,
        kind: editDraft.kind,
      });
      toast.success('Badanie zaktualizowane.');
      reload();
      setEditingId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się zaktualizować badania.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(exam: MedicalExam) {
    const ok = await confirm({
      title: 'Usunąć badanie?',
      message: `Badanie "${KIND_LABELS[exam.kind]}" z dnia ${fmt(exam.performed_on)} zostanie usunięte.`,
      confirmText: 'Usuń',
      type: 'danger',
    });
    if (!ok) return;
    setSaving(true);
    try {
      await medicalApi.remove(exam.id);
      toast.success('Badanie usunięte.');
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się usunąć badania.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="form-card animate-fade-up" style={{ maxWidth: '48rem' }}>
      <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--color-ink)' }}>
        Badania lekarskie
      </h2>

      {loading ? (
        <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.875rem' }}>Ładowanie…</p>
      ) : exams.length === 0 && !adding ? (
        <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.875rem', marginBottom: canWrite ? '1rem' : 0 }}>
          Brak zarejestrowanych badań.
        </p>
      ) : (
        <table className="refined-table" style={{ marginBottom: canWrite ? '1rem' : 0 }}>
          <thead>
            <tr>
              <th>Rodzaj</th>
              <th>Data badania</th>
              <th>Ważne do</th>
              <th>Opis</th>
              {canWrite && <th className="text-right">Akcje</th>}
            </tr>
          </thead>
          <tbody>
            {exams.map((exam) =>
              editingId === exam.id ? (
                <tr key={exam.id}>
                  <td>
                    <SearchableSelect
                      id={`medical-edit-kind-${exam.id}`}
                      ariaLabel="Rodzaj badania"
                      triggerStyle={{ padding: '0.25rem 0.5rem', fontSize: '0.8125rem' }}
                      options={KIND_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
                      value={editDraft.kind}
                      onChange={(v) => setEditDraft((d) => ({ ...d, kind: v as MedicalExam['kind'] }))}
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      className="form-input"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.8125rem' }}
                      value={editDraft.performed_on}
                      onChange={(e) => setEditDraft((d) => ({ ...d, performed_on: e.target.value }))}
                      aria-label="Data badania"
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
                    <input
                      type="text"
                      className="form-input"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.8125rem' }}
                      value={editDraft.description}
                      onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))}
                      aria-label="Opis"
                    />
                  </td>
                  <td className="text-right">
                    <div className="action-icons">
                      <Button type="button" variant="secondary" small onClick={() => handleSaveEdit(exam.id)} disabled={saving || !editDraft.performed_on}>
                        Zapisz
                      </Button>
                      <Button type="button" variant="secondary" small onClick={() => setEditingId(null)} disabled={saving}>
                        Anuluj
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={exam.id}>
                  <td>{KIND_LABELS[exam.kind]}</td>
                  <td>{fmt(exam.performed_on)}</td>
                  <td>{fmt(exam.valid_until)}</td>
                  <td>{exam.description ?? '—'}</td>
                  {canWrite && (
                    <td className="text-right">
                      <div className="action-icons">
                        <button type="button" className="action-icon-btn" title="Edytuj" aria-label="Edytuj badanie" onClick={() => startEdit(exam)}>
                          <Icon name="edit" />
                        </button>
                        <button type="button" className="action-icon-btn" title="Usuń" aria-label="Usuń badanie" onClick={() => handleDelete(exam)} disabled={saving}>
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
        <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr auto', alignItems: 'end' }}>
          <div>
            <SearchableSelect
              id="medical-add-kind"
              label="Rodzaj"
              options={KIND_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
              value={draft.kind}
              onChange={(v) => setDraft((d) => ({ ...d, kind: v as MedicalExam['kind'] }))}
            />
          </div>
          <div>
            <label className="form-label">Data badania</label>
            <input type="date" className="form-input" value={draft.performed_on} onChange={(e) => setDraft((d) => ({ ...d, performed_on: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Ważne do</label>
            <input type="date" className="form-input" value={draft.valid_until} onChange={(e) => setDraft((d) => ({ ...d, valid_until: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Opis</label>
            <input type="text" className="form-input" value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="primary" small onClick={handleAdd} disabled={saving || !draft.performed_on}>
              Dodaj
            </Button>
            <Button type="button" variant="secondary" small onClick={() => setAdding(false)} disabled={saving}>
              Anuluj
            </Button>
          </div>
        </div>
      )}

      {canWrite && !adding && (
        <Button type="button" variant="secondary" onClick={startAdd}>
          <Icon name="add" size={16} />
          Dodaj badanie
        </Button>
      )}
    </div>
  );
}
