import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { TextField, TextareaField } from '@/components/ui/form';
import { useApiData } from '@/lib/api/useApiData';
import { absencesApi, type AbsenceBalance } from '@/lib/api/absences';
import { ApiError } from '@/lib/api/client';
import { useToast } from '@/lib/feedback/ToastProvider';
import { useAuth } from '@/lib/auth/AuthContext';

const STATUS_LABEL: Record<AbsenceBalance['status'], string> = {
  ok: 'OK',
  warning: 'Zbliża się limit',
  exceeded: 'Przekroczony',
  unlimited: 'Bez limitu',
};

function BalanceBar({ b }: { b: AbsenceBalance }) {
  const pct = Math.min(b.pct, 100);
  const color =
    b.status === 'exceeded' ? 'var(--color-error)' : b.status === 'warning' ? 'var(--color-warning)' : 'var(--color-accent)';
  return (
    <div className="form-card" style={{ padding: '1rem' }}>
      <div className="flex items-center justify-between mb-2">
        <strong>{b.category_name}</strong>
        <StatusBadge status={b.status}>{STATUS_LABEL[b.status]}</StatusBadge>
      </div>
      <p className="text-sm mb-2" style={{ color: 'var(--color-ink-subtle)' }}>
        {b.net_used} / {b.has_limit ? b.limit : '∞'} {b.unit === 'days' ? 'dni' : 'godzin'} — okres {b.period_label}
      </p>
      {b.has_limit && (
        <div style={{ height: 8, borderRadius: 4, background: 'var(--color-surface-muted, #eee)', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 200ms' }} />
        </div>
      )}
    </div>
  );
}

export function AbsenceBalancesPage() {
  const { workerId: paramWorkerId } = useParams<{ workerId?: string }>();
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const isAdmin = hasRole('superadmin', 'hr_manager');

  const workerId = paramWorkerId ?? user?.workerId ?? '';
  const [jumpToId, setJumpToId] = useState('');

  const [adjCategoryId, setAdjCategoryId] = useState('');
  const [adjDelta, setAdjDelta] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [limitCategoryId, setLimitCategoryId] = useState('');
  const [limitValue, setLimitValue] = useState('');
  const [newApproverId, setNewApproverId] = useState('');
  const [approverError, setApproverError] = useState<string | null>(null);

  const { data, loading, error, reload } = useApiData(
    () => (workerId ? absencesApi.workerBalances(workerId) : Promise.resolve({ balances: [], worker_name: '' })),
    [workerId],
  );
  const { data: adjData, reload: reloadAdj } = useApiData(
    () => (isAdmin && workerId ? absencesApi.listAdjustments(workerId) : Promise.resolve({ adjustments: [] })),
    [workerId, isAdmin],
  );
  const { data: approverData, reload: reloadApprovers } = useApiData(
    () => (isAdmin && workerId ? absencesApi.listApprovers(workerId) : Promise.resolve({ approvers: [] })),
    [workerId, isAdmin],
  );

  const balances = data?.balances ?? [];
  const adjustments = adjData?.adjustments ?? [];
  const approvers = approverData?.approvers ?? [];

  async function handleSetLimit(e: React.FormEvent) {
    e.preventDefault();
    if (!limitCategoryId || !limitValue) return;
    try {
      await absencesApi.setLimit(workerId, Number(limitCategoryId), Number(limitValue));
      toast.success('Limit zapisany.');
      setLimitCategoryId('');
      setLimitValue('');
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Nie udało się zapisać limitu.');
    }
  }

  async function handleCreateAdjustment(e: React.FormEvent) {
    e.preventDefault();
    if (!adjCategoryId || !adjDelta || !adjReason.trim()) return;
    try {
      await absencesApi.createAdjustment(workerId, Number(adjCategoryId), Number(adjDelta), adjReason.trim());
      toast.success('Korekta dodana.');
      setAdjCategoryId('');
      setAdjDelta('');
      setAdjReason('');
      reload();
      reloadAdj();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Nie udało się dodać korekty.');
    }
  }

  async function handleDeleteAdjustment(id: number) {
    try {
      await absencesApi.deleteAdjustment(workerId, id);
      toast.success('Korekta usunięta.');
      reload();
      reloadAdj();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Nie udało się usunąć korekty.');
    }
  }

  async function handleAddApprover(e: React.FormEvent) {
    e.preventDefault();
    const id = newApproverId.trim();
    setApproverError(null);
    if (!id) return;
    if (id === workerId) {
      setApproverError('Pracownik nie może być swoim własnym przełożonym.');
      return;
    }
    try {
      await absencesApi.addApprover(workerId, id);
      toast.success('Przełożony przypisany.');
      setNewApproverId('');
      reloadApprovers();
    } catch (err) {
      setApproverError(err instanceof ApiError ? err.message : 'Nie udało się przypisać przełożonego.');
    }
  }

  async function handleRemoveApprover(approverWorkerId: string) {
    try {
      await absencesApi.removeApprover(workerId, approverWorkerId);
      toast.success('Przełożony odpięty.');
      reloadApprovers();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Nie udało się odpiąć przełożonego.');
    }
  }

  return (
    <div className="refined-page">
      <PageHeader
        title="Bilans nieobecności"
        subtitle={data?.worker_name ? `Pracownik: ${data.worker_name}` : 'Wybierz pracownika'}
        actions={
          isAdmin && (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (jumpToId.trim()) navigate(`/absences/balances/${jumpToId.trim()}`);
              }}
            >
              <input className="form-input" placeholder="ID pracownika…" value={jumpToId} onChange={(e) => setJumpToId(e.target.value)} style={{ maxWidth: 160 }} />
              <Button type="submit" variant="secondary">
                Pokaż
              </Button>
            </form>
          )
        }
      />

      {!workerId ? (
        <EmptyState icon="badge" title="Brak przypisanego pracownika" message="Twoje konto nie jest przypisane do żadnego pracownika." />
      ) : loading ? (
        <TableSkeleton cols={3} />
      ) : error ? (
        <EmptyState icon="error" title="Nie udało się wczytać danych" message={error} />
      ) : balances.length === 0 ? (
        <EmptyState icon="badge" title="Brak śledzonych kategorii" message="Żadna kategoria nieobecności nie ma włączonego śledzenia limitu." />
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {balances.map((b) => (
            <BalanceBar key={b.category_id} b={b} />
          ))}
        </div>
      )}

      {isAdmin && workerId && (
        <>
          <div className="form-card mt-6">
            <h3 className="form-legend">Przełożeni (zatwierdzają wnioski tego pracownika)</h3>
            <p className="text-sm mb-3" style={{ color: 'var(--color-ink-subtle)' }}>
              Niepowiązane z etykietą "przełożony" na profilu pracownika (ta jest wyliczana ze struktury
              organizacyjnej) — to jest lista osób, które faktycznie zatwierdzają jego wnioski o nieobecność.
            </p>
            {approvers.length === 0 ? (
              <p className="text-sm mb-3" style={{ color: 'var(--color-ink-subtle)' }}>
                Brak przypisanych przełożonych — pracownik nie będzie mógł złożyć wniosku, dopóki nie dodasz co
                najmniej jednego.
              </p>
            ) : (
              <ul className="mb-3 space-y-1">
                {approvers.map((a) => (
                  <li key={a.worker_id} className="flex items-center justify-between" style={{ maxWidth: 360 }}>
                    <span>
                      {a.full_name} <span style={{ color: 'var(--color-ink-subtle)' }}>({a.worker_id})</span>
                    </span>
                    <Button variant="ghost" small onClick={() => handleRemoveApprover(a.worker_id)}>
                      Odepnij
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={handleAddApprover} className="flex items-start gap-2">
              <TextField
                label="ID pracownika-przełożonego"
                name="new_approver_id"
                value={newApproverId}
                onChange={(e) => setNewApproverId(e.target.value)}
                error={approverError ?? undefined}
              />
              <Button type="submit" variant="primary" small style={{ marginTop: 22 }}>
                Dodaj przełożonego
              </Button>
            </form>
          </div>

          <div className="grid gap-4 mt-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
            <form onSubmit={handleSetLimit} className="form-card">
              <h3 className="form-legend">Ustaw indywidualny limit</h3>
              <div className="form-grid">
                <TextField label="ID kategorii" name="limit_category_id" type="number" value={limitCategoryId} onChange={(e) => setLimitCategoryId(e.target.value)} />
                <TextField label="Nowy limit" name="limit_value" type="number" step="0.5" value={limitValue} onChange={(e) => setLimitValue(e.target.value)} />
              </div>
              <div className="mt-3">
                <Button type="submit" variant="primary" small>
                  Zapisz limit
                </Button>
              </div>
            </form>

            <form onSubmit={handleCreateAdjustment} className="form-card">
              <h3 className="form-legend">Dodaj korektę bilansu</h3>
              <div className="form-grid">
                <TextField label="ID kategorii" name="adj_category_id" type="number" value={adjCategoryId} onChange={(e) => setAdjCategoryId(e.target.value)} />
                <TextField label="Wartość (+/-)" name="adj_delta" type="number" step="0.5" value={adjDelta} onChange={(e) => setAdjDelta(e.target.value)} />
                <TextareaField label="Powód" name="adj_reason" fullWidth required value={adjReason} onChange={(e) => setAdjReason(e.target.value)} />
              </div>
              <div className="mt-3">
                <Button type="submit" variant="primary" small>
                  Dodaj korektę
                </Button>
              </div>
            </form>
          </div>

          {adjustments.length > 0 && (
            <div className="table-container mt-4">
              <table className="refined-table">
                <thead>
                  <tr>
                    <th>Kategoria</th>
                    <th>Wartość</th>
                    <th>Powód</th>
                    <th>Kto / kiedy</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {adjustments.map((a) => (
                    <tr key={a.id}>
                      <td>{a.category_name}</td>
                      <td>{a.delta_value > 0 ? `+${a.delta_value}` : a.delta_value}</td>
                      <td>{a.reason}</td>
                      <td>
                        {a.created_by_name ?? '—'} · {new Date(a.created_at).toLocaleDateString('pl-PL')}
                      </td>
                      <td>
                        <Button variant="ghost" small onClick={() => handleDeleteAdjustment(a.id)}>
                          Usuń
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
