import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { FormCard, FormFieldset, SelectField, TextField, TextareaField, FormActions } from '@/components/ui/form';
import { Icon } from '@/lib/icons/Icon';
import { useApiData } from '@/lib/api/useApiData';
import { absencesApi, type AbsenceRecord } from '@/lib/api/absences';
import { ApiError } from '@/lib/api/client';
import { useToast } from '@/lib/feedback/ToastProvider';
import { useConfirm } from '@/lib/feedback/ConfirmProvider';
import { useAuth } from '@/lib/auth/AuthContext';

const STATUS_LABEL: Record<AbsenceRecord['status'], string> = {
  pending: 'Oczekuje',
  approved: 'Zatwierdzona',
  rejected: 'Odrzucona',
  cancelled: 'Anulowana',
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('pl-PL');
}

type TabKey = 'pending' | 'all' | 'manual';

export function AbsenceManagementPage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole('superadmin', 'hr_manager');
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, error, reload } = useApiData(() => absencesApi.management());

  const [tab, setTab] = useState<TabKey>('pending');
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const [manualOpen, setManualOpen] = useState(false);
  const [manualWorkerId, setManualWorkerId] = useState('');
  const [manualCategoryId, setManualCategoryId] = useState('');
  const [manualDateFrom, setManualDateFrom] = useState('');
  const [manualDateTo, setManualDateTo] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualSubmitting, setManualSubmitting] = useState(false);

  const requests = data?.requests ?? [];
  const manual = data?.manual ?? [];
  const categories = data?.categories ?? [];
  const pending = requests.filter((r) => r.status === 'pending');
  const rows = tab === 'pending' ? pending : tab === 'all' ? requests : manual;

  async function handleApprove(a: AbsenceRecord) {
    try {
      await absencesApi.approve(a.id);
      toast.success('Wniosek zatwierdzony.');
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Nie udało się zatwierdzić.');
    }
  }

  async function handleReject(a: AbsenceRecord) {
    if (!rejectReason.trim()) return;
    try {
      await absencesApi.reject(a.id, rejectReason.trim());
      toast.success('Wniosek odrzucony.');
      setRejectingId(null);
      setRejectReason('');
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Nie udało się odrzucić.');
    }
  }

  async function handleCancelApproved(a: AbsenceRecord) {
    const ok = await confirm({
      title: 'Anulować zatwierdzoną nieobecność?',
      message: `${a.worker_name} — ${a.category_name} (${fmtDate(a.date_from)} – ${fmtDate(a.date_to)})`,
      confirmText: 'Anuluj',
      type: 'warning',
    });
    if (!ok) return;
    try {
      await absencesApi.cancelApproved(a.id);
      toast.success('Anulowano.');
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Nie udało się anulować.');
    }
  }

  async function handleDeleteManual(a: AbsenceRecord) {
    const ok = await confirm({
      title: 'Usunąć wpis?',
      message: `${a.worker_name} — ${a.category_name} (${fmtDate(a.date_from)} – ${fmtDate(a.date_to)})`,
      confirmText: 'Usuń',
      type: 'danger',
    });
    if (!ok) return;
    try {
      await absencesApi.deleteAbsence(a.id);
      toast.success('Usunięto.');
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Nie udało się usunąć.');
    }
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    setManualError(null);
    setManualSubmitting(true);
    try {
      await absencesApi.createManual({
        worker_id: manualWorkerId.trim(),
        category_id: Number(manualCategoryId),
        date_from: manualDateFrom,
        date_to: manualDateTo || manualDateFrom,
        notes: manualNotes.trim() || null,
      });
      toast.success('Nieobecność dodana.');
      setManualOpen(false);
      setManualWorkerId('');
      setManualCategoryId('');
      setManualDateFrom('');
      setManualDateTo('');
      setManualNotes('');
      reload();
    } catch (err) {
      setManualError(err instanceof ApiError ? err.message : 'Nie udało się dodać nieobecności.');
    } finally {
      setManualSubmitting(false);
    }
  }

  return (
    <div className="refined-page">
      <PageHeader
        title="Zarządzanie nieobecnościami"
        subtitle="Wnioski pracowników i ręczne rejestracje (np. L4)"
        actions={
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Link to="/absences/categories">
                <Button variant="secondary">
                  <Icon name="settings" size={16} />
                  Kategorie
                </Button>
              </Link>
            )}
            <Button variant="primary" onClick={() => setManualOpen((v) => !v)}>
              <Icon name="add" size={16} />
              Dodaj ręcznie
            </Button>
          </div>
        }
      />

      {manualOpen && (
        <form onSubmit={handleManualSubmit}>
          <FormCard>
            <FormFieldset title="Ręczna rejestracja nieobecności" description="Auto-zatwierdzona — np. zwolnienie lekarskie zgłoszone przez pracownika">
              <TextField label="ID pracownika" name="worker_id" required value={manualWorkerId} onChange={(e) => setManualWorkerId(e.target.value)} />
              <SelectField
                label="Rodzaj nieobecności"
                name="category_id"
                required
                value={manualCategoryId}
                onChange={(e) => setManualCategoryId(e.target.value)}
                options={categories.filter((c) => !c.is_deleted).map((c) => ({ value: String(c.id), label: c.name }))}
                placeholder="Wybierz kategorię…"
              />
              <TextField label="Data od" name="date_from" type="date" required value={manualDateFrom} onChange={(e) => setManualDateFrom(e.target.value)} />
              <TextField label="Data do" name="date_to" type="date" value={manualDateTo} onChange={(e) => setManualDateTo(e.target.value)} helper="Puste = jeden dzień" />
              <TextareaField label="Notatka" name="notes" value={manualNotes} onChange={(e) => setManualNotes(e.target.value)} fullWidth />
            </FormFieldset>
            {manualError && (
              <p className="text-sm mt-2" style={{ color: 'var(--color-error)' }}>
                {manualError}
              </p>
            )}
            <div className="mt-4">
              <FormActions submitLabel="Dodaj" isLoading={manualSubmitting} onCancel={() => setManualOpen(false)} />
            </div>
          </FormCard>
        </form>
      )}

      <div className="page-tabs-row">
        <div className="page-tabs" role="tablist" aria-label="Widok nieobecności">
          <button type="button" role="tab" aria-selected={tab === 'pending'} className={`page-tab ${tab === 'pending' ? 'is-active' : ''}`} onClick={() => setTab('pending')}>
            Oczekujące ({pending.length})
          </button>
          <button type="button" role="tab" aria-selected={tab === 'all'} className={`page-tab ${tab === 'all' ? 'is-active' : ''}`} onClick={() => setTab('all')}>
            Wszystkie wnioski
          </button>
          <button type="button" role="tab" aria-selected={tab === 'manual'} className={`page-tab ${tab === 'manual' ? 'is-active' : ''}`} onClick={() => setTab('manual')}>
            Ręczne wpisy
          </button>
        </div>
      </div>

      <div className="table-container" style={{ flex: 1 }}>
        {loading ? (
          <TableSkeleton cols={7} />
        ) : error ? (
          <EmptyState icon="error" title="Nie udało się wczytać danych" message={error} />
        ) : rows.length === 0 ? (
          <EmptyState icon="badge" title="Brak wpisów" message="Nic tu nie ma — na razie." />
        ) : (
          <table className="refined-table">
            <thead>
              <tr>
                <th>Pracownik</th>
                <th>Rodzaj</th>
                <th>Od</th>
                <th>Do</th>
                <th>Status</th>
                <th>Notatka</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td>{a.worker_name}</td>
                  <td>{a.category_name}</td>
                  <td>
                    {fmtDate(a.date_from)}
                    {a.time_from ? ` ${a.time_from}` : ''}
                  </td>
                  <td>
                    {fmtDate(a.date_to)}
                    {a.time_to ? ` ${a.time_to}` : ''}
                  </td>
                  <td>
                    <StatusBadge status={a.status}>{STATUS_LABEL[a.status]}</StatusBadge>
                  </td>
                  <td>{a.notes ?? '—'}</td>
                  <td>
                    <div className="flex items-center gap-1 flex-wrap">
                      {a.status === 'pending' && (
                        <>
                          <Button variant="primary" small onClick={() => handleApprove(a)}>
                            Zatwierdź
                          </Button>
                          {rejectingId === a.id ? (
                            <>
                              <input
                                className="form-input"
                                style={{ maxWidth: 180 }}
                                placeholder="Powód odrzucenia"
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                              />
                              <Button variant="danger" small onClick={() => handleReject(a)}>
                                Potwierdź
                              </Button>
                              <Button variant="ghost" small onClick={() => setRejectingId(null)}>
                                Anuluj
                              </Button>
                            </>
                          ) : (
                            <Button variant="secondary" small onClick={() => setRejectingId(a.id)}>
                              Odrzuć
                            </Button>
                          )}
                        </>
                      )}
                      {a.status === 'approved' && a.source === 'manual' && (
                        <Button variant="ghost" small onClick={() => handleDeleteManual(a)}>
                          Usuń
                        </Button>
                      )}
                      {a.status === 'approved' && a.source === 'request' && (
                        <Button variant="ghost" small onClick={() => handleCancelApproved(a)}>
                          Anuluj
                        </Button>
                      )}
                    </div>
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
