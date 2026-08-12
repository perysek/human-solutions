import { useState, type FormEvent } from 'react';
import { FormActions, FormCard, FormFieldset, TextField } from '@/components/ui/form';
import { ALL_MODULES, rolesApi, type ModuleFlags, type RoleListItem } from '@/lib/api/roles';
import { RolePermissionMatrix } from './RolePermissionMatrix';
import { useToast } from '@/lib/feedback/ToastProvider';
import { ApiError } from '@/lib/api/client';
import { useEscapeAction } from '@/lib/a11y/useEscapeAction';

function emptyPermissions(): Record<string, ModuleFlags> {
  return Object.fromEntries(ALL_MODULES.map((m) => [m, { has_access: false, read_only: false, own_data: false }]));
}

interface RoleFormProps {
  mode: 'create' | 'edit';
  initial?: RoleListItem;
  onSaved: (roleId: number) => void;
  onCancel: () => void;
}

export function RoleForm({ mode, initial, onSaved, onCancel }: RoleFormProps) {
  const toast = useToast();
  useEscapeAction(onCancel);

  const [name, setName] = useState(initial?.name ?? '');
  const [displayName, setDisplayName] = useState(initial?.display_name ?? '');
  const [permissions, setPermissions] = useState<Record<string, ModuleFlags>>(
    initial?.permissions_detail ?? emptyPermissions(),
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function togglePermission(moduleName: string, hasAccess: boolean) {
    setPermissions((cur) => ({
      ...cur,
      [moduleName]: { ...(cur[moduleName] ?? { read_only: false, own_data: false }), has_access: hasAccess },
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'create') {
        const result = await rolesApi.create(name.trim().toLowerCase().replace(/\s+/g, '_'), displayName, permissions);
        toast.success('Rola utworzona.');
        onSaved(result.role_id);
      } else if (initial) {
        await rolesApi.update(initial.id, displayName, permissions);
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

      <FormCard>
        <FormFieldset title="Dane roli">
          {mode === 'create' && (
            <TextField
              label="Identyfikator (kod)"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              helper="Wewnętrzna nazwa, bez spacji — np. koordynator"
            />
          )}
          <TextField label="Wyświetlana nazwa" name="display_name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required fullWidth={mode === 'edit'} />
        </FormFieldset>

        <fieldset className="form-fieldset">
          <legend className="form-legend">Uprawnienia modułowe</legend>
          <RolePermissionMatrix value={permissions} onChange={togglePermission} />
        </fieldset>
      </FormCard>

      <FormActions submitLabel={mode === 'create' ? 'Utwórz rolę' : 'Zapisz zmiany'} onCancel={onCancel} isLoading={submitting} />
    </form>
  );
}
