import { useMemo, useState, type FormEvent } from 'react';
import { FormActions, FormSection, TextField, SelectField, CheckboxField } from '@/components/ui/form';
import { useApiData } from '@/lib/api/useApiData';
import { usersApi, type UserListItem, type UserPayload } from '@/lib/api/users';
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
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [password, setPassword] = useState('');
  const [workerId, setWorkerId] = useState(initial?.worker_id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const roleOptions = useMemo(() => (options?.roles ?? []).map((r) => ({ value: r.name, label: r.display_name })), [options]);

  // Workers already linked to a DIFFERENT account are dropped from the list —
  // idx_users_worker_id_unique enforces one account per worker, so offering
  // an already-taken one would just bounce back as a 409. The worker
  // currently linked to *this* account (edit mode) stays selectable so the
  // field doesn't appear to lose its own value.
  const workerOptions = useMemo(
    () =>
      (options?.workers ?? [])
        .filter((w) => !w.linked_user_id || w.linked_user_id === initial?.id)
        .map((w) => ({ value: w.id, label: w.is_active ? w.full_name : `${w.full_name} (nieaktywny)` })),
    [options, initial],
  );

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
      worker_id: workerId || null,
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
    <form onSubmit={handleSubmit} className="form-shell space-y-3">
      {error && <div className="flash-message flash-error">{error}</div>}

      <FormSection title="Dane konta">
        <TextField label="Imię i nazwisko" name="full_name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        <TextField label="Email" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
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
          label="Pracownik"
          name="worker_id"
          value={workerId}
          onChange={(e) => setWorkerId(e.target.value)}
          options={workerOptions}
          placeholder="Brak — konto nieprzypisane"
          helper="Wymagane, aby to konto mogło składać wnioski o nieobecność jako konkretny pracownik."
        />
        <TextField
          label={mode === 'create' ? 'Hasło' : 'Nowe hasło (opcjonalnie)'}
          name="password"
          type="password"
          autoComplete="new-password"
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
