import { useMemo, useRef, useState } from 'react';
import { Icon } from '@/lib/icons/Icon';
import { Button } from '@/components/ui/Button';
import { useFocusTrap } from '@/lib/a11y/useFocusTrap';
import { useEscapeClaim } from '@/lib/a11y/useEscapeClaim';
import { useApiData } from '@/lib/api/useApiData';
import { jobsApi } from '@/lib/api/jobs';
import { departmentsApi } from '@/lib/api/departments';
import { useToast } from '@/lib/feedback/ToastProvider';

interface AddJobsToDepartmentModalProps {
  departmentId: number;
  departmentName: string;
  onClose: () => void;
  /** Called after a successful add so DepartmentsListPage's job_count/
   * worker_count columns (both derived from jobs.department_id) refresh. */
  onAdded: () => void;
}

/** Task 1 — "Działy firmy" list's '+' action: a searchable multi-select of
 * job-positions, bulk-assigned to this department in one request
 * (departmentsApi.addJobs). Same modal chrome as CreateTrainingModal, but a
 * checkbox list instead of SearchableSelect's single-value popover —
 * SearchableSelect has no multi-select mode, and retrofitting one onto a
 * component every single-select field in the app depends on isn't worth it
 * for this one screen. */
export function AddJobsToDepartmentModal({ departmentId, departmentName, onClose, onAdded }: AddJobsToDepartmentModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(true, panelRef);
  useEscapeClaim(true);
  const toast = useToast();

  const { data: jobsData, loading } = useApiData(() => jobsApi.list());
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const jobs = jobsData?.jobs;
  const filtered = useMemo(() => {
    const list = jobs ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((j) => j.id.toLowerCase().includes(q) || (j.description ?? '').toLowerCase().includes(q));
  }, [jobs, query]);

  function toggle(jobId: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  }

  async function handleSubmit() {
    if (selected.size === 0) return;
    setSubmitting(true);
    try {
      await departmentsApi.addJobs(departmentId, [...selected]);
      toast.success(selected.size === 1 ? 'Stanowisko dodane do działu.' : `Stanowiska dodane do działu (${selected.size}).`);
      onAdded();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się dodać stanowisk.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="add-jobs-modal-title" className="modal-content" style={{ maxWidth: '30rem' }}>
        <div className="modal-header">
          <h3 id="add-jobs-modal-title">Dodaj stanowiska do działu „{departmentName}”</h3>
          <button type="button" className="modal-close" aria-label="Zamknij" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="modal-body">
          <input
            type="text"
            className="refined-input"
            placeholder="Szukaj stanowiska…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ marginBottom: '0.75rem' }}
            autoFocus
            aria-label="Szukaj stanowiska"
          />
          {loading ? (
            <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.875rem' }}>Ładowanie…</p>
          ) : filtered.length === 0 ? (
            <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.875rem' }}>Brak wyników.</p>
          ) : (
            <div role="listbox" aria-multiselectable="true" aria-label="Stanowiska" style={{ maxHeight: '18rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
              {filtered.map((j) => (
                <label
                  key={j.id}
                  role="option"
                  aria-selected={selected.has(j.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 0.625rem',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    background: selected.has(j.id) ? 'var(--color-accent-muted)' : 'transparent',
                  }}
                >
                  <input type="checkbox" className="refined-checkbox" checked={selected.has(j.id)} onChange={() => toggle(j.id)} />
                  <span style={{ fontSize: '0.875rem', color: 'var(--color-ink)' }}>
                    {j.description || j.id}
                    {j.department_name && (
                      <span style={{ color: 'var(--color-ink-subtle)' }}> — obecnie: {j.department_name}</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Anuluj
          </Button>
          <Button type="button" variant="primary" onClick={handleSubmit} disabled={submitting || selected.size === 0}>
            {submitting ? 'Dodawanie…' : `Dodaj${selected.size > 0 ? ` (${selected.size})` : ''}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
