import { useMemo, useState, type FormEvent } from 'react';
import { FormActions, FormSection, TextField, SelectField, CheckboxField } from '@/components/ui/form';
import { useApiData } from '@/lib/api/useApiData';
import { usersApi, type EmployeeOption, type UserListItem, type UserPayload } from '@/lib/api/users';
import { useToast } from '@/lib/feedback/ToastProvider';
import { ApiError } from '@/lib/api/client';
import { useEscapeAction } from '@/lib/a11y/useEscapeAction';

interface UserFormProps {
  mode: 'create' | 'edit';
  initial?: UserListItem;
  onSaved: (userId: number) => void;
  /** Cancel button AND Escape key both call this — one target, two triggers. */
  onCancel: () => void;
}

export function UserForm({ mode, initial, onSaved, onCancel }: UserFormProps) {
  const toast = useToast();
  useEscapeAction(onCancel);
  const { data: options } = useApiData(() => usersApi.formOptions());

  const [fullName, setFullName] = useState(initial?.full_name ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [role, setRole] = useState(initial?.role ?? '');
  const [employeeId, setEmployeeId] = useState<string>(initial?.employee_id ? String(initial.employee_id) : '');
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const employeeOptions = useMemo<EmployeeOption[]>(() => {
    const list = options?.available_employees ?? [];
    if (initial?.employee_id && !list.some((e) => e.id === initial.employee_id)) {
      return [...list, { id: initial.employee_id, first_name: initial.employee_name ?? '', last_name: '' }];
    }
    return list;
  }, [options, initial]);

  const roleOptions = useMemo(() => (options?.roles ?? []).map((r) => ({ value: r.name, label: r.display_name })), [options]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === 'create' && password.length < 8) {
      setError('Hasło musi mieć co najmniej 8 znaków.');
      return;
    }

    const payload: UserPayload = {
      email,
      full_name: fullName,
      role,
      is_active: isActive,
      employee_id: employeeId ? Number(employeeId) : null,
    };
    if (mode === 'create') payload.password = password;
    if (mode === 'edit' && password) payload.new_password = password;

    setSubmitting(true);
    try {
      if (mode === 'create') {
        const result = await usersApi.create(payload);
        toast.success('Użytkownik utworzony.');
        onSaved(result.user_id);
      } else if (initial) {
        await usersApi.update(initial.id, payload);
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

      <FormSection title="Dane konta">
        <TextField label="Imię i nazwisko" name="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} required fullWidth />
        <TextField label="Email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required fullWidth />
        <SelectField
          label="Rola"
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          options={roleOptions}
          placeholder="Wybierz rolę…"
          required
        />
        <SelectField
          label="Powiązany pracownik"
          name="employee_id"
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          options={employeeOptions.map((e) => ({ value: String(e.id), label: `${e.first_name} ${e.last_name}`.trim() }))}
          placeholder="Brak powiązania"
        />
        <TextField
          label={mode === 'create' ? 'Hasło' : 'Nowe hasło (opcjonalnie)'}
          name="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required={mode === 'create'}
          helper={mode === 'edit' ? 'Zostaw puste, aby nie zmieniać hasła.' : 'Minimum 8 znaków.'}
        />
        <CheckboxField name="is_active" label="Konto aktywne" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
      </FormSection>

      <FormActions submitLabel={mode === 'create' ? 'Utwórz użytkownika' : 'Zapisz zmiany'} onCancel={onCancel} isLoading={submitting} />
    </form>
  );
}
