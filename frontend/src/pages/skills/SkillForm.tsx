import { useState, type FormEvent } from 'react';
import { FormActions, FormSection, TextField, TextareaField } from '@/components/ui/form';
import { skillsApi, type SkillListItem } from '@/lib/api/skills';
import { useToast } from '@/lib/feedback/ToastProvider';
import { ApiError } from '@/lib/api/client';
import { useEscapeAction } from '@/lib/a11y/useEscapeAction';

interface SkillFormProps {
  mode: 'create' | 'edit';
  initial?: SkillListItem;
  onSaved: (skillId: string) => void;
  onCancel: () => void;
}

/** Same natural-TEXT-key contract as JobForm — see that file's comment. */
export function SkillForm({ mode, initial, onSaved, onCancel }: SkillFormProps) {
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
        const result = await skillsApi.create({ id: id.trim(), description: description.trim() });
        toast.success('Umiejętność utworzona.');
        onSaved(result.id);
      } else if (initial) {
        await skillsApi.update(initial.id, description.trim());
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

      <FormSection title="Umiejętność">
        {mode === 'create' ? (
          <TextField
            label="Identyfikator (kod)"
            name="id"
            value={id}
            onChange={(e) => setId(e.target.value)}
            required
            helper="Kod umiejętności, np. 0002 — dziedziczony z legacy systemu."
          />
        ) : (
          <TextField label="Identyfikator (kod)" name="id" value={initial?.id ?? ''} readOnly disabled />
        )}
        <TextareaField
          label="Opis"
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          fullWidth
        />
      </FormSection>

      <FormActions submitLabel={mode === 'create' ? 'Utwórz umiejętność' : 'Zapisz zmiany'} onCancel={onCancel} isLoading={submitting} />
    </form>
  );
}
