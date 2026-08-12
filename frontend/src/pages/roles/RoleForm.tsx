import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FormActions, FormSection, TextField } from '@/components/ui/form';
import { ALL_MODULES, rolesApi, type ModuleFlags, type RoleListItem } from '@/lib/api/roles';
import { RolePermissionMatrix } from './RolePermissionMatrix';
import { useToast } from '@/lib/feedback/ToastProvider';
import { ApiError } from '@/lib/api/client';

function emptyPermissions(): Record<string, ModuleFlags> {
  return Object.fromEntries(ALL_MODULES.map((m) => [m, { has_access: false, read_only: false, own_data: false }]));
}

interface RoleFormProps {
  mode: 'create' | 'edit';
  initial?: RoleListItem;
  onSaved: (roleId: number) => void;
}

export function RoleForm({ mode, initial, onSaved }: RoleFormProps) {
  const navigate = useNavigate();
  const toast = useToast();

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
    <form onSubmit={handleSubmit} className="space-y-6" style={{ maxWidth: '40rem' }}>
      {error && <div className="flash-message flash-error">{error}</div>}

      <FormSection title="Dane roli">
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
      </FormSection>

      <div>
        <h2 className="text-base font-semibold mb-3" style={{ color: 'var(--color-ink)' }}>
          Uprawnienia modułowe
        </h2>
        <RolePermissionMatrix value={permissions} onChange={togglePermission} />
      </div>

      <FormActions submitLabel={mode === 'create' ? 'Utwórz rolę' : 'Zapisz zmiany'} onCancel={() => navigate('/roles')} isLoading={submitting} />
    </form>
  );
}
