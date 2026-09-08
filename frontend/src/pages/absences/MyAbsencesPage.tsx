import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { FormCard, FormFieldset, SelectField, TextField, TextareaField, FormActions } from '@/components/ui/form';
import { Icon } from '@/lib/icons/Icon';
import { useApiData } from '@/lib/api/useApiData';
import { absencesApi, type AbsenceRecord, type ReviewerResolution } from '@/lib/api/absences';
import { ApiError } from '@/lib/api/client';
import { useToast } from '@/lib/feedback/ToastProvider';
import { useConfirm } from '@/lib/feedback/ConfirmProvider';

const STATUS_LABEL: Record<AbsenceRecord['status'], string> = {
  pending: 'Oczekuje',
  approved: 'Zatwierdzona',
  rejected: 'Odrzucona',
  cancelled: 'Anulowana',
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('pl-PL');
}

export function MyAbsencesPage() {
  const { data, loading, error, reload } = useApiData(() => absencesApi.myAbsences());
  const toast = useToast();
  const confirm = useConfirm();

  const [formOpen, setFormOpen] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [timeFrom, setTimeFrom] = useState('');
  const [timeTo, setTimeTo] = useState('');
  const [approverId, setApproverId] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Reviewer is auto-assigned from the org structure (worker_absence_service
  // .resolve_reviewer) — there is no more free-choice "Przełożony" select.
  // Re-resolved every time date_from changes, since the escalation to an
  // upper-level supervisor depends on the requested start date.
  const [reviewer, setReviewer] = useState<ReviewerResolution | null>(null);
  const [reviewerLoading, setReviewerLoading] = useState(false);
  const [reviewerError, setReviewerError] = useState<string | null>(null);

  const categories = data?.categories ?? [];
  const absences = data?.absences ?? [];
  // Top of the hierarchy (jobs.is_director) has nobody to pick as
  // "Przełożony" — worker_absence_service.submit_request auto-approves
  // these instead of routing them to an approver. Mirrored in `reviewer`
  // once a date is picked; this flag just lets the form skip that fetch.
  const autoApprove = data?.auto_approve ?? false;

  const selectedCategory = categories.find((c) => String(c.id) === categoryId);
  const isFullDay = selectedCategory?.absence_full_day ?? true;
  const reviewerCandidates = reviewer?.candidates ?? [];
  const showReviewerDropdown = reviewerCandidates.length > 1;

  useEffect(() => {
    if (autoApprove || !dateFrom) {
      setReviewer(null);
      setReviewerError(null);
      return;
    }
    let cancelled = false;
    setReviewerLoading(true);
    setReviewerError(null);
    absencesApi
      .resolveReviewer(dateFrom)
      .then((res) => {
        if (cancelled) return;
        setReviewer(res);
        setApproverId(res.resolved_approver_worker_id ?? '');
      })
      .catch((err) => {
        if (cancelled) return;
        setReviewer(null);
        setReviewerError(err instanceof ApiError ? err.message : 'Nie udało się wyznaczyć przełożonego.');
      })
      .finally(() => {
        if (!cancelled) setReviewerLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [autoApprove, dateFrom]);

  function resetForm() {
    setCategoryId('');
    setDateFrom('');
    setDateTo('');
    setTimeFrom('');
    setTimeTo('');
    setApproverId('');
    setNotes('');
    setFormError(null);
    setReviewer(null);
    setReviewerError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!autoApprove) {
      if (reviewerError) {
        setFormError(reviewerError);
        return;
      }
      if (showReviewerDropdown && !approverId) {
        setFormError('Wybierz jednego z dostępnych przełożonych.');
        return;
      }
    }
    setSubmitting(true);
    try {
      await absencesApi.submit({
        category_id: Number(categoryId),
        date_from: dateFrom,
        date_to: isFullDay ? dateTo || dateFrom : dateFrom,
        time_from: isFullDay ? null : timeFrom,
        time_to: isFullDay ? null : timeTo,
        approver_worker_id: autoApprove ? undefined : approverId,
        notes: notes.trim() || null,
      });
      toast.success('Wniosek został złożony.');
      resetForm();
      setFormOpen(false);
      reload();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Nie udało się złożyć wniosku.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(a: AbsenceRecord) {
    const ok = await confirm({
      title: a.status === 'pending' ? 'Anulować wniosek?' : 'Anulować nieobecność?',
      message: `${a.category_name} (${fmtDate(a.date_from)} – ${fmtDate(a.date_to)})`,
      confirmText: 'Anuluj',
      type: 'warning',
    });
    if (!ok) return;
    try {
      if (a.status === 'pending') {
        await absencesApi.cancelOwn(a.id);
      } else {
        await absencesApi.cancelOwnApproved(a.id);
      }
      toast.success('Anulowano.');
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Nie udało się anulować.');
    }
  }

  return (
    <div className="refined-page">
      <PageHeader
        title="Moje nieobecności"
        subtitle="Wnioski urlopowe, home office, zwolnienia i inne nieobecności"
        actions={
          <Button variant="primary" onClick={() => setFormOpen((v) => !v)}>
            <Icon name="add" size={16} />
            {formOpen ? 'Zamknij formularz' : 'Złóż wniosek'}
          </Button>
        }
      />

      {formOpen && (
        <form onSubmit={handleSubmit}>
          <FormCard>
            <FormFieldset title="Nowy wniosek o nieobecność">
              <SelectField
                label="Rodzaj nieobecności"
                name="category_id"
                required
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
                placeholder="Wybierz kategorię…"
              />
              <TextField label="Data od" name="date_from" type="date" required value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              {isFullDay ? (
                <TextField label="Data do" name="date_to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} helper="Puste = jeden dzień" />
              ) : (
                <>
                  <TextField label="Godzina od" name="time_from" type="time" required value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)} />
                  <TextField label="Godzina do" name="time_to" type="time" required value={timeTo} onChange={(e) => setTimeTo(e.target.value)} />
                </>
              )}
              {/* Przełożony is auto-assigned from the org structure (no more
                  free-choice select) — resolved server-side from date_from
                  via resolveReviewer(). A dropdown only ever appears when
                  the resolution itself is ambiguous (>1 available reviewer
                  at the resolved level, typically after escalating past an
                  absent direct supervisor). */}
              {autoApprove ? (
                <div className="form-field-full">
                  <p className="text-sm" style={{ color: 'var(--color-ink-subtle)' }}>
                    Twoje wnioski są zatwierdzane automatycznie — zajmujesz najwyższe stanowisko w hierarchii firmy.
                  </p>
                </div>
              ) : !dateFrom ? (
                <div className="form-field-full">
                  <p className="text-sm" style={{ color: 'var(--color-ink-subtle)' }}>
                    Wybierz datę „od”, aby wyznaczyć przełożonego zatwierdzającego wniosek.
                  </p>
                </div>
              ) : reviewerLoading ? (
                <div className="form-field-full">
                  <p className="text-sm" style={{ color: 'var(--color-ink-subtle)' }}>
                    Wyznaczanie przełożonego…
                  </p>
                </div>
              ) : reviewerError ? (
                <div className="form-field-full">
                  <p className="text-sm" style={{ color: 'var(--color-error)' }}>
                    {reviewerError}
                  </p>
                </div>
              ) : showReviewerDropdown ? (
                <SelectField
                  label="Przełożony"
                  name="approver_worker_id"
                  required
                  value={approverId}
                  onChange={(e) => setApproverId(e.target.value)}
                  options={reviewerCandidates.map((a) => ({ value: a.worker_id, label: a.full_name }))}
                  placeholder="Wybierz przełożonego…"
                  helper="Twój bezpośredni przełożony jest niedostępny w najbliższym czasie — wybierz zastępującego przełożonego wyższego szczebla."
                />
              ) : reviewer?.resolved_approver_worker_id ? (
                <div className="form-field-full">
                  <p className="text-sm" style={{ color: 'var(--color-ink-subtle)' }}>
                    Przełożony: <strong>{reviewerCandidates[0]?.full_name}</strong> (przypisany automatycznie)
                  </p>
                </div>
              ) : (
                <div className="form-field-full">
                  <p className="text-sm" style={{ color: 'var(--color-error)' }}>
                    Brak przypisanego przełożonego — skontaktuj się z HR.
                  </p>
                </div>
              )}
              <TextareaField label="Notatka" name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} fullWidth helper="Opcjonalnie" />
            </FormFieldset>
            {formError && (
              <p className="text-sm mt-2" style={{ color: 'var(--color-error)' }}>
                {formError}
              </p>
            )}
            <div className="mt-4">
              <FormActions submitLabel="Wyślij wniosek" isLoading={submitting} onCancel={() => setFormOpen(false)} />
            </div>
          </FormCard>
        </form>
      )}

      <div className="table-container" style={{ flex: 1 }}>
        {loading ? (
          <TableSkeleton cols={6} />
        ) : error ? (
          <EmptyState icon="error" title="Nie udało się wczytać danych" message={error} />
        ) : absences.length === 0 ? (
          <EmptyState icon="badge" title="Brak nieobecności" message="Złóż swój pierwszy wniosek powyżej." />
        ) : (
          <table className="refined-table">
            <thead>
              <tr>
                <th>Rodzaj</th>
                <th>Od</th>
                <th>Do</th>
                <th>Przełożony</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {absences.map((a) => (
                <tr key={a.id}>
                  <td>{a.category_name}</td>
                  <td>
                    {fmtDate(a.date_from)}
                    {a.time_from ? ` ${a.time_from}` : ''}
                  </td>
                  <td>
                    {fmtDate(a.date_to)}
                    {a.time_to ? ` ${a.time_to}` : ''}
                  </td>
                  <td>{a.approver_name ?? '—'}</td>
                  <td>
                    <StatusBadge status={a.status}>{STATUS_LABEL[a.status]}</StatusBadge>
                    {a.status === 'rejected' && a.rejection_reason && (
                      <p className="text-xs mt-1" style={{ color: 'var(--color-ink-subtle)' }}>
                        {a.rejection_reason}
                      </p>
                    )}
                  </td>
                  <td>
                    {(a.status === 'pending' || a.status === 'approved') && (
                      <Button variant="ghost" small onClick={() => handleCancel(a)}>
                        Anuluj
                      </Button>
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
