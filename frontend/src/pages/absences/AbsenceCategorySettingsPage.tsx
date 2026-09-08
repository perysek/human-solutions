import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { Button } from '@/components/ui/Button';
import { CheckboxField, FormActions, FormCard, FormFieldset, SelectField, TextField } from '@/components/ui/form';
import { Icon } from '@/lib/icons/Icon';
import { useApiData } from '@/lib/api/useApiData';
import { absencesApi, type AbsenceCategory, type CategoryPayload } from '@/lib/api/absences';
import { ApiError } from '@/lib/api/client';
import { useToast } from '@/lib/feedback/ToastProvider';
import { useConfirm } from '@/lib/feedback/ConfirmProvider';

const EMPTY: CategoryPayload = {
  name: '',
  description: '',
  absence_full_day: true,
  is_tracked: false,
  count_period: 'yearly',
  resets_at: 1,
  rolling_days: null,
  warning_threshold_pct: 0.8,
  default_max_value: 0,
};

/** Toggle-switch settings for every absence category — is_tracked flips
 * whether a limit is enforced at all; the rest only matter once it's on.
 * This IS the "customizable absence types with balance limits" surface —
 * no separate schema, every type (vacation, L4, home office, custom ones
 * HR adds later) is just a row here (see ABSENCE_MANAGEMENT_PLAN.md). */
export function AbsenceCategorySettingsPage() {
  const { data, loading, error, reload } = useApiData(() => absencesApi.listCategories(true));
  const toast = useToast();
  const confirm = useConfirm();

  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<CategoryPayload>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const categories = data?.categories ?? [];

  function startEdit(cat: AbsenceCategory) {
    setEditingId(cat.id);
    setForm({
      name: cat.name,
      description: cat.description ?? '',
      absence_full_day: cat.absence_full_day,
      is_tracked: cat.is_tracked,
      count_period: cat.count_period,
      resets_at: cat.resets_at,
      rolling_days: cat.rolling_days,
      warning_threshold_pct: cat.warning_threshold_pct,
      default_max_value: cat.default_max_value,
    });
  }

  function startNew() {
    setEditingId('new');
    setForm(EMPTY);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setFormError(null);
    try {
      if (editingId === 'new') {
        await absencesApi.createCategory(form);
        toast.success('Kategoria dodana.');
      } else if (typeof editingId === 'number') {
        await absencesApi.updateCategory(editingId, form);
        toast.success('Kategoria zaktualizowana.');
      }
      setEditingId(null);
      reload();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Nie udało się zapisać kategorii.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(cat: AbsenceCategory) {
    const ok = await confirm({
      title: 'Usunąć kategorię?',
      message: `${cat.name} — istniejące nieobecności zostaną zachowane, kategoria zniknie z formularzy.`,
      confirmText: 'Usuń',
      type: 'danger',
    });
    if (!ok) return;
    try {
      await absencesApi.deleteCategory(cat.id);
      toast.success('Usunięto.');
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Nie udało się usunąć.');
    }
  }

  return (
    <div className="refined-page">
      <PageHeader
        title="Kategorie nieobecności"
        subtitle="Włącz śledzenie limitu i ustaw okres rozliczeniowy dla każdego rodzaju nieobecności"
        actions={
          <Button variant="primary" onClick={startNew}>
            <Icon name="add" size={16} />
            Nowa kategoria
          </Button>
        }
      />

      {editingId !== null && (
        <form onSubmit={handleSave}>
          <FormCard>
            <FormFieldset title={editingId === 'new' ? 'Nowa kategoria' : 'Edytuj kategorię'}>
              <TextField label="Nazwa" name="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <TextField
                label="Opis"
                name="description"
                value={form.description ?? ''}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
              <CheckboxField
                name="absence_full_day"
                label="Nieobecność całodniowa"
                description="Wyłącz dla krótkich wyjść w trakcie dnia (np. wyjście prywatne) — wtedy wymagane są godziny."
                checked={form.absence_full_day}
                onChange={(e) => setForm({ ...form, absence_full_day: e.target.checked })}
              />
              <CheckboxField
                name="is_tracked"
                label="Śledź limit / bilans"
                description="Włącz, aby liczyć wykorzystanie względem limitu (np. 26 dni/rok). Zostaw wyłączone dla nieobecności bez limitu (np. L4)."
                checked={form.is_tracked}
                onChange={(e) => setForm({ ...form, is_tracked: e.target.checked })}
              />
              {form.is_tracked && (
                <>
                  <SelectField
                    label="Okres rozliczeniowy"
                    name="count_period"
                    value={form.count_period}
                    onChange={(e) => setForm({ ...form, count_period: e.target.value as CategoryPayload['count_period'] })}
                    options={[
                      { value: 'yearly', label: 'Roczny' },
                      { value: 'monthly', label: 'Miesięczny' },
                      { value: 'rolling', label: 'Kroczący (N dni wstecz)' },
                    ]}
                  />
                  {form.count_period === 'rolling' ? (
                    <TextField
                      label="Długość okresu (dni)"
                      name="rolling_days"
                      type="number"
                      min={1}
                      value={form.rolling_days ?? ''}
                      onChange={(e) => setForm({ ...form, rolling_days: e.target.value ? Number(e.target.value) : null })}
                    />
                  ) : (
                    <TextField
                      label={form.count_period === 'yearly' ? 'Dzień resetu (dzień roku)' : 'Dzień resetu (dzień miesiąca)'}
                      name="resets_at"
                      type="number"
                      min={1}
                      max={365}
                      value={form.resets_at ?? ''}
                      onChange={(e) => setForm({ ...form, resets_at: e.target.value ? Number(e.target.value) : null })}
                    />
                  )}
                  <TextField
                    label={`Domyślny limit (${form.absence_full_day ? 'dni' : 'godzin'})`}
                    name="default_max_value"
                    type="number"
                    step="0.5"
                    min={0}
                    value={form.default_max_value}
                    onChange={(e) => setForm({ ...form, default_max_value: Number(e.target.value) })}
                    helper="0 = bez limitu domyślnie (można nadpisać per pracownik)"
                  />
                  <TextField
                    label="Próg ostrzeżenia (%)"
                    name="warning_threshold_pct"
                    type="number"
                    step="5"
                    min={0}
                    max={100}
                    value={Math.round(form.warning_threshold_pct * 100)}
                    onChange={(e) => setForm({ ...form, warning_threshold_pct: Number(e.target.value) / 100 })}
                  />
                </>
              )}
            </FormFieldset>
            {formError && (
              <p className="text-sm mt-2" style={{ color: 'var(--color-error)' }}>
                {formError}
              </p>
            )}
            <div className="mt-4">
              <FormActions submitLabel="Zapisz" isLoading={saving} onCancel={() => setEditingId(null)} />
            </div>
          </FormCard>
        </form>
      )}

      <div className="table-container" style={{ flex: 1 }}>
        {loading ? (
          <TableSkeleton cols={6} />
        ) : error ? (
          <EmptyState icon="error" title="Nie udało się wczytać danych" message={error} />
        ) : categories.length === 0 ? (
          <EmptyState icon="badge" title="Brak kategorii" message="Dodaj pierwszą kategorię nieobecności." />
        ) : (
          <table className="refined-table">
            <thead>
              <tr>
                <th>Nazwa</th>
                <th>Typ</th>
                <th>Śledzenie limitu</th>
                <th>Domyślny limit</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id} style={c.is_deleted ? { opacity: 0.5 } : undefined}>
                  <td>{c.name}</td>
                  <td>{c.absence_full_day ? 'Całodniowa' : 'Godzinowa (slot)'}</td>
                  <td>
                    {c.is_tracked
                      ? `${c.count_period === 'yearly' ? 'Rocznie' : c.count_period === 'monthly' ? 'Miesięcznie' : `Kroczące (${c.rolling_days} dni)`}`
                      : 'Bez limitu'}
                  </td>
                  <td>{c.is_tracked ? `${c.default_max_value} ${c.absence_full_day ? 'dni' : 'godz.'}` : '—'}</td>
                  <td>{c.is_deleted ? 'Usunięta' : 'Aktywna'}</td>
                  <td>
                    {!c.is_deleted && (
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" small onClick={() => startEdit(c)}>
                          Edytuj
                        </Button>
                        <Button variant="ghost" small onClick={() => handleDelete(c)}>
                          Usuń
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
