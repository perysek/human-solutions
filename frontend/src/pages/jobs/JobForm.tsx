import { useMemo, useState, type FormEvent } from 'react';
import { CheckboxField, FormActions, FormSection, SelectField, TextField, TextareaField } from '@/components/ui/form';
import { jobsApi, type JobListItem } from '@/lib/api/jobs';
import { departmentsApi } from '@/lib/api/departments';
import { useApiData } from '@/lib/api/useApiData';
import { useToast } from '@/lib/feedback/ToastProvider';
import { ApiError } from '@/lib/api/client';
import { useEscapeAction } from '@/lib/a11y/useEscapeAction';

interface JobFormProps {
  mode: 'create' | 'edit';
  initial?: JobListItem;
  onSaved: (jobId: string) => void;
  onCancel: () => void;
  /** Task 2 — set when JobEditPage was reached from the Pulpit's "Stanowiska
   * bez działu" alert: expands the "Dział" select on mount so the field the
   * user came here to fix is immediately visible/focused, no extra click. */
  autoFocusDepartment?: boolean;
}

/** Jobs use a natural TEXT key (id = the position code, e.g. "BRYGADZISTA") —
 * there is no separate display-name field. The id is only editable at
 * creation, same pattern as RoleForm's "Identyfikator (kod)" field. */
export function JobForm({ mode, initial, onSaved, onCancel, autoFocusDepartment }: JobFormProps) {
  const toast = useToast();
  useEscapeAction(onCancel);

  const { data: departmentsData } = useApiData(() => departmentsApi.options());
  const departmentOptions = useMemo(
    () => (departmentsData?.departments ?? []).map((d) => ({ value: String(d.id), label: d.name })),
    [departmentsData],
  );

  const [id, setId] = useState(initial?.id ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [departmentId, setDepartmentId] = useState(initial?.department_id != null ? String(initial.department_id) : '');
  const [isManagerial, setIsManagerial] = useState(initial?.is_managerial ?? false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'create') {
        const result = await jobsApi.create({
          id: id.trim(),
          description: description.trim() || null,
          department_id: departmentId ? Number(departmentId) : null,
          is_managerial: isManagerial,
        });
        toast.success('Stanowisko utworzone.');
        onSaved(result.id);
      } else if (initial) {
        await jobsApi.update(initial.id, {
          description: description.trim() || null,
          department_id: departmentId ? Number(departmentId) : null,
          is_managerial: isManagerial,
        });
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
        <SelectField
          label="Dział"
          name="department_id"
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          options={departmentOptions}
          placeholder="Brak"
          autoOpen={autoFocusDepartment}
        />
        <TextareaField
          label="Opis"
          name="description"
          value={description ?? ''}
          onChange={(e) => setDescription(e.target.value)}
          fullWidth
        />
        <div className="form-field-full">
          <CheckboxField
            name="is_managerial"
            label="Stanowisko kierownicze"
            description="Pracownik na tym stanowisku jest wykazywany jako kierownik przypisanego działu."
            checked={isManagerial}
            onChange={(e) => setIsManagerial(e.target.checked)}
          />
        </div>
      </FormSection>

      <FormActions submitLabel={mode === 'create' ? 'Utwórz stanowisko' : 'Zapisz zmiany'} onCancel={onCancel} isLoading={submitting} />
    </form>
  );
}
