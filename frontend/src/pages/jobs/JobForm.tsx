import { useState, type FormEvent } from 'react';
import { FormActions, FormSection, TextField, TextareaField } from '@/components/ui/form';
import { jobsApi, type JobListItem } from '@/lib/api/jobs';
import { useToast } from '@/lib/feedback/ToastProvider';
import { ApiError } from '@/lib/api/client';
import { useEscapeAction } from '@/lib/a11y/useEscapeAction';

interface JobFormProps {
  mode: 'create' | 'edit';
  initial?: JobListItem;
  onSaved: (jobId: string) => void;
  onCancel: () => void;
}

/** Jobs use a natural TEXT key (id = the position code, e.g. "BRYGADZISTA") —
 * there is no separate display-name field. The id is only editable at
 * creation, same pattern as RoleForm's "Identyfikator (kod)" field. */
export function JobForm({ mode, initial, onSaved, onCancel }: JobFormProps) {
  const toast = useToast();
  useEscapeAction(onCancel);

  const [id, setId] = useState(initial?.id ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'create') {
        const result = await jobsApi.create({ id: id.trim(), description: description.trim() || null });
        toast.success('Stanowisko utworzone.');
        onSaved(result.id);
      } else if (initial) {
        await jobsApi.update(initial.id, description.trim() || null);
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

      <FormSection title="Stanowisko">
        {mode === 'create' ? (
          <TextField
            label="Identyfikator (kod)"
            name="id"
            value={id}
            onChange={(e) => setId(e.target.value)}
            required
            helper="Kod stanowiska, np. BRYGADZISTA — używany też jako nazwa wyświetlana."
          />
        ) : (
          <TextField label="Identyfikator (kod)" name="id" value={initial?.id ?? ''} readOnly disabled />
        )}
        <TextareaField
          label="Opis"
          name="description"
          value={description ?? ''}
          onChange={(e) => setDescription(e.target.value)}
          fullWidth
        />
      </FormSection>

      <FormActions submitLabel={mode === 'create' ? 'Utwórz stanowisko' : 'Zapisz zmiany'} onCancel={onCancel} isLoading={submitting} />
    </form>
  );
}
