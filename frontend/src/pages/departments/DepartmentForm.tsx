import { useMemo, useState, type FormEvent } from 'react';
import { FormActions, FormSection, TextField, TextareaField } from '@/components/ui/form';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Icon } from '@/lib/icons/Icon';
import { departmentsApi, type DepartmentListItem } from '@/lib/api/departments';
import { useToast } from '@/lib/feedback/ToastProvider';
import { useOrgChartRevisionToast } from '@/lib/orgChart/useOrgChartRevisionToast';
import { getDescendantIds } from '@/lib/utils/departmentTree';
import { ApiError } from '@/lib/api/client';
import { useEscapeAction } from '@/lib/a11y/useEscapeAction';

interface DepartmentFormProps {
  mode: 'create' | 'edit';
  initial?: DepartmentListItem;
  /** Already fetched by the parent page (DepartmentCreatePage/
   * DepartmentEditPage) — passed down rather than fetched here to avoid a
   * duplicate request every time the form mounts. Needs the FULL
   * DepartmentListItem shape (not departmentsApi.options()'s bare id/name)
   * because the edit-mode exclusion below reads parent_department_id off
   * every row to walk the tree. */
  allDepartments: DepartmentListItem[];
  onSaved: () => void;
  onCancel: () => void;
}

/** Serial-PK dictionary entry (unlike Job/SkillForm's natural TEXT key —
 * see DepartmentRepository's module docstring) — `name` is the only
 * user-facing identifier, editable in both create and edit. */
export function DepartmentForm({ mode, initial, allDepartments, onSaved, onCancel }: DepartmentFormProps) {
  const toast = useToast();
  const orgChartToast = useOrgChartRevisionToast();
  useEscapeAction(onCancel);

  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [parentDepartmentId, setParentDepartmentId] = useState(
    initial?.parent_department_id != null ? String(initial.parent_department_id) : '',
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // create: no filtering — a department that doesn't exist yet can't be
  // anyone's ancestor, so every existing department is a valid parent.
  // edit: exclude the department itself and every one of its descendants —
  // an obviously-invalid cycle the UI shouldn't even offer (the server's
  // would_create_cycle check is the authoritative guard; this is just the
  // UI not presenting a choice already known to fail).
  const parentOptions = useMemo(() => {
    const excluded = mode === 'edit' && initial ? getDescendantIds(initial.id, allDepartments) : new Set<number>();
    if (mode === 'edit' && initial) excluded.add(initial.id);
    return allDepartments.filter((d) => !excluded.has(d.id)).map((d) => ({ value: String(d.id), label: d.name }));
  }, [allDepartments, mode, initial]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        parent_department_id: parentDepartmentId ? Number(parentDepartmentId) : null,
      };
      if (mode === 'create') {
        const result = await departmentsApi.create(payload);
        toast.success('Dział utworzony.');
        orgChartToast.notify(result.org_chart_revision);
      } else if (initial) {
        const result = await departmentsApi.update(initial.id, payload);
        toast.success('Zmiany zapisane.');
        orgChartToast.notify(result.org_chart_revision);
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
        <div>
          <label htmlFor="parent_department_id" className="form-label">
            Dział nadrzędny
          </label>
          <div className="flex items-center gap-2">
            <div style={{ flex: 1, minWidth: 0 }}>
              <SearchableSelect
                id="parent_department_id"
                options={parentOptions}
                value={parentDepartmentId}
                onChange={setParentDepartmentId}
                placeholder="Brak (dział najwyższego poziomu)"
              />
            </div>
            <button
              type="button"
              className="action-icon-btn"
              title="Wyczyść dział nadrzędny"
              aria-label="Wyczyść wybrany dział nadrzędny"
              onClick={() => setParentDepartmentId('')}
              disabled={!parentDepartmentId}
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
      </FormSection>

      <FormActions submitLabel={mode === 'create' ? 'Utwórz dział' : 'Zapisz zmiany'} onCancel={onCancel} isLoading={submitting} />
    </form>
  );
}
