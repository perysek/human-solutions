import { useState, type FormEvent } from 'react';
import { FormActions, FormSection, TextField, TextareaField } from '@/components/ui/form';
import { trainingsApi, type TrainingListItem } from '@/lib/api/trainings';
import { useToast } from '@/lib/feedback/ToastProvider';
import { ApiError } from '@/lib/api/client';
import { useEscapeAction } from '@/lib/a11y/useEscapeAction';

interface TrainingFormProps {
  mode: 'create' | 'edit';
  initial?: TrainingListItem;
  onSaved: (id: number) => void;
  onCancel: () => void;
}

/** TRN_2/6/7 — trainings use a surrogate SERIAL id (no natural key the way
 * jobs/skills do), so unlike JobForm there's no id field at all. */
export function TrainingForm({ mode, initial, onSaved, onCancel }: TrainingFormProps) {
  const toast = useToast();
  useEscapeAction(onCancel);

  const [description, setDescription] = useState(initial?.description ?? '');
  const [trainingDate, setTrainingDate] = useState(initial?.training_date ?? '');
  const [completion, setCompletion] = useState(initial?.completion?.toString() ?? '');
  const [remarks, setRemarks] = useState(initial?.remarks ?? '');
  const [relatedDocs, setRelatedDocs] = useState(initial?.related_docs ?? '');
  const [trainingDetails, setTrainingDetails] = useState(initial?.training_details ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        description: description.trim(),
        training_date: trainingDate || null,
        completion: completion === '' ? null : Number(completion),
        remarks: remarks.trim() || null,
        related_docs: relatedDocs.trim() || null,
        training_details: trainingDetails.trim() || null,
      };
      if (mode === 'create') {
        const result = await trainingsApi.create(payload);
        toast.success('Szkolenie utworzone.');
        onSaved(result.id);
      } else if (initial) {
        await trainingsApi.update(initial.id, payload);
        toast.success('Zmiany zapisane.');
        onSaved(initial.id);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Nie udało się zapisać.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form-shell space-y-3">
      {error && <div className="flash-message flash-error">{error}</div>}

      <FormSection title="Szkolenie">
        <TextField label="Nazwa" name="description" value={description} onChange={(e) => setDescription(e.target.value)} required fullWidth />
        <TextField label="Data szkolenia" name="training_date" type="date" value={trainingDate} onChange={(e) => setTrainingDate(e.target.value)} />
        <TextField
          label="Stopień ukończenia (%)"
          name="completion"
          type="number"
          min={0}
          max={100}
          value={completion}
          onChange={(e) => setCompletion(e.target.value)}
        />
        <TextareaField label="Uwagi" name="remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} fullWidth />
        <TextareaField
          label="Szczegóły szkolenia"
          name="training_details"
          value={trainingDetails}
          onChange={(e) => setTrainingDetails(e.target.value)}
          fullWidth
        />
        <TextareaField
          label="Dokumenty referencyjne"
          name="related_docs"
          value={relatedDocs}
          onChange={(e) => setRelatedDocs(e.target.value)}
          fullWidth
          helper="Odnośniki lub nazwy dokumentów powiązanych ze szkoleniem."
        />
      </FormSection>

      <FormActions submitLabel={mode === 'create' ? 'Utwórz szkolenie' : 'Zapisz zmiany'} onCancel={onCancel} isLoading={submitting} />
    </form>
  );
}
