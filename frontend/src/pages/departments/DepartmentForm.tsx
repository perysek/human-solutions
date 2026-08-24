import { useState, type FormEvent } from 'react';
import { FormActions, FormSection, TextField, TextareaField } from '@/components/ui/form';
import { departmentsApi, type DepartmentListItem } from '@/lib/api/departments';
import { useToast } from '@/lib/feedback/ToastProvider';
import { ApiError } from '@/lib/api/client';
import { useEscapeAction } from '@/lib/a11y/useEscapeAction';

interface DepartmentFormProps {
  mode: 'create' | 'edit';
  initial?: DepartmentListItem;
  onSaved: () => void;
  onCancel: () => void;
}

/** Serial-PK dictionary entry (unlike Job/SkillForm's natural TEXT key —
 * see DepartmentRepository's module docstring) — `name` is the only
 * user-facing identifier, editable in both create and edit. */
export function DepartmentForm({ mode, initial, onSaved, onCancel }: DepartmentFormProps) {
  const toast = useToast();
  useEscapeAction(onCancel);

  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload = { name: name.trim(), description: description.trim() || null };
      if (mode === 'create') {
        await departmentsApi.create(payload);
        toast.success('Dział utworzony.');
      } else if (initial) {
        await departmentsApi.update(initial.id, payload);
        toast.success('Zmiany zapisane.');
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Nie udało się zapisać.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form-shell space-y-3">
      {error && <div className="flash-message flash-error">{error}</div>}

      <FormSection title="Dział">
        <TextField label="Nazwa działu" name="name" value={name} onChange={(e) => setName(e.target.value)} required />
        <TextareaField
          label="Opis"
          name="description"
          value={description ?? ''}
          onChange={(e) => setDescription(e.target.value)}
          fullWidth
        />
      </FormSection>

      <FormActions submitLabel={mode === 'create' ? 'Utwórz dział' : 'Zapisz zmiany'} onCancel={onCancel} isLoading={submitting} />
    </form>
  );
}
