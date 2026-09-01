import { useMemo, useState, type FormEvent } from 'react';
import { CheckboxField, FormActions, FormSection, TextField, TextareaField } from '@/components/ui/form';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Icon } from '@/lib/icons/Icon';
import { jobsApi, type JobListItem } from '@/lib/api/jobs';
import { departmentsApi } from '@/lib/api/departments';
import { useApiData } from '@/lib/api/useApiData';
import { useToast } from '@/lib/feedback/ToastProvider';
import { useOrgChartRevisionToast } from '@/lib/orgChart/useOrgChartRevisionToast';
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
  const orgChartToast = useOrgChartRevisionToast();
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
  const [isDirector, setIsDirector] = useState(initial?.is_director ?? false);
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
          is_director: isDirector,
        });
        toast.success('Stanowisko utworzone.');
        if (result.warning) toast.warning(result.warning);
        orgChartToast.notify(result.org_chart_revision);
        onSaved(result.id);
      } else if (initial) {
        const result = await jobsApi.update(initial.id, {
          description: description.trim() || null,
          department_id: departmentId ? Number(departmentId) : null,
          is_managerial: isManagerial,
          is_director: isDirector,
        });
        toast.success('Zmiany zapisane.');
        if (result.warning) toast.warning(result.warning);
        orgChartToast.notify(result.org_chart_revision);
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
        <div>
          <label htmlFor="department_id" className="form-label">
            Dział
          </label>
          <div className="flex items-center gap-2">
            <div style={{ flex: 1, minWidth: 0 }}>
              <SearchableSelect
                id="department_id"
                options={departmentOptions}
                value={departmentId}
                onChange={setDepartmentId}
                placeholder="Brak"
                autoOpen={autoFocusDepartment}
              />
            </div>
            <button
              type="button"
              className="action-icon-btn"
              title="Wyczyść dział"
              aria-label="Wyczyść wybrany dział"
              onClick={() => setDepartmentId('')}
              disabled={!departmentId}
            >
              <Icon name="close" />
            </button>
          </div>
        </div>
        <TextareaField
          label="Opis"
          name="description"
          value={description ?? ''}
          onChange={(e) => setDescription(e.target.value)}
          fullWidth
        />
        <div className="form-field-full space-y-2">
          <CheckboxField
            name="is_director"
            label="Dyrektor zakładu"
            description="Pracownik na tym stanowisku jest przełożonym wszystkich stanowisk kierowniczych — zwierzchnik najwyższego szczebla, ponad kierownikami działów."
            checked={isDirector}
            onChange={(e) => setIsDirector(e.target.checked)}
          />
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
