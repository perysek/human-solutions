import { api } from './client';

export interface AbsenceCategory {
  id: number;
  name: string;
  description: string | null;
  absence_full_day: boolean;
  is_deleted: boolean;
  is_tracked: boolean;
  count_period: 'yearly' | 'monthly' | 'rolling';
  resets_at: number | null;
  rolling_days: number | null;
  warning_threshold_pct: number;
  default_max_value: number;
}

export interface AbsenceRecord {
  id: number;
  worker_id: string;
  worker_name: string | null;
  category_id: number;
  category_name: string | null;
  absence_full_day: boolean;
  date_from: string;
  date_to: string;
  time_from: string | null;
  time_to: string | null;
  approver_worker_id: string | null;
  approver_name: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  rejection_reason: string | null;
  notes: string | null;
  source: 'request' | 'manual';
  requested_at: string | null;
  responded_at: string | null;
}

export interface ApproverOption {
  worker_id: string;
  full_name: string;
}

/** Row of the "Dodaj ręcznie" form's "Pracownik" picker
 * (manual/worker-options) — scoped server-side to the caller's own team
 * unless they're superadmin/hr_manager (see routes/absences/routes.py's
 * manual_worker_options). */
export interface WorkerOption {
  id: string;
  full_name: string;
}

export interface AbsenceBalance {
  category_id: number;
  category_name: string;
  absence_full_day: boolean;
  unit: 'days' | 'hours';
  used: number;
  adjustments: number;
  net_used: number;
  limit: number;
  default_max_value: number;
  has_limit: boolean;
  pct: number;
  warning_threshold_pct: number;
  status: 'unlimited' | 'exceeded' | 'warning' | 'ok';
  period_start: string;
  period_label: string;
}

export interface AbsenceAdjustment {
  id: number;
  category_name: string;
  delta_value: number;
  reason: string;
  period_label: string | null;
  created_at: string;
  created_by_name: string | null;
}

export interface AbsenceAuditEntry {
  id: number;
  entity_type: string;
  action: string;
  entity_label: string | null;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  user_name: string | null;
  timestamp: string;
}

export interface SubmitAbsencePayload {
  category_id: number;
  date_from: string;
  date_to?: string;
  time_from?: string | null;
  time_to?: string | null;
  /** Only meaningful when resolveReviewer() returned more than one
   * candidate (dropdown shown) — otherwise the server auto-assigns the
   * reviewer itself and ignores this field. Omitted entirely for a
   * top-manager submitter (jobs.is_director has nobody above it to
   * approve). See ReviewerResolution. */
  approver_worker_id?: string;
  notes?: string | null;
}

export interface ReviewerResolution {
  auto_approve: boolean;
  /** Non-empty only when there's genuine ambiguity to resolve — render a
   * select from these and require a choice. Empty (or single-item) means
   * no picker is needed. */
  candidates: ApproverOption[];
  /** Set when exactly one reviewer is available at the resolved org-chart
   * level — the form should show this name read-only, no select. */
  resolved_approver_worker_id: string | null;
}

export interface ManualAbsencePayload {
  worker_id: string;
  category_id: number;
  date_from: string;
  date_to?: string;
  time_from?: string | null;
  time_to?: string | null;
  notes?: string | null;
}

export interface CategoryPayload {
  name: string;
  description?: string | null;
  absence_full_day: boolean;
  is_tracked: boolean;
  count_period: 'yearly' | 'monthly' | 'rolling';
  resets_at?: number | null;
  rolling_days?: number | null;
  warning_threshold_pct: number;
  default_max_value: number;
}

export const absencesApi = {
  // self-service
  myAbsences: () =>
    api.get<{
      absences: AbsenceRecord[];
      categories: AbsenceCategory[];
      approvers: ApproverOption[];
      /** True for the worker holding jobs.is_director — MyAbsencesPage hides
       * the "Przełożony" field and submits straight through when set. */
      auto_approve: boolean;
    }>('/absences/api/my'),
  previewConflicts: (params: { date_from: string; date_to?: string; time_from?: string; time_to?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return api.get<{ conflicts: unknown[] }>(`/absences/api/my/preview-conflicts?${qs}`);
  },
  resolveReviewer: (date_from: string) =>
    api.get<ReviewerResolution>(`/absences/api/my/resolve-reviewer?date_from=${encodeURIComponent(date_from)}`),
  submit: (payload: SubmitAbsencePayload) => api.post<{ id: number }>('/absences/api/my/submit', payload),
  cancelOwn: (id: number) => api.post(`/absences/api/my/${id}/cancel`),
  cancelOwnApproved: (id: number) => api.post(`/absences/api/my/${id}/cancel-approved`),
  pendingCount: () => api.get<{ count: number }>('/absences/api/pending-count'),

  // management
  management: () =>
    api.get<{ requests: AbsenceRecord[]; manual: AbsenceRecord[]; categories: AbsenceCategory[]; pending_count: number }>(
      '/absences/api/management',
    ),
  approve: (id: number) => api.post(`/absences/api/${id}/approve`),
  reject: (id: number, rejection_reason: string) => api.post(`/absences/api/${id}/reject`, { rejection_reason }),
  cancelApproved: (id: number) => api.post(`/absences/api/${id}/cancel-approved`),
  manualWorkerOptions: () => api.get<{ workers: WorkerOption[] }>('/absences/api/manual/worker-options'),
  createManual: (payload: ManualAbsencePayload) => api.post<{ absence_id: number }>('/absences/api/manual', payload),
  updateManual: (id: number, payload: Omit<ManualAbsencePayload, 'worker_id'>) => api.put(`/absences/api/${id}`, payload),
  deleteAbsence: (id: number) => api.del(`/absences/api/${id}`),
  hardDeleteAbsence: (id: number) => api.del(`/absences/api/${id}/permanent`),

  // categories
  listCategories: (includeDeleted = false) =>
    api.get<{ categories: AbsenceCategory[] }>(`/absences/api/categories?include_deleted=${includeDeleted}`),
  createCategory: (payload: CategoryPayload) => api.post<{ id: number }>('/absences/api/categories', payload),
  updateCategory: (id: number, payload: CategoryPayload) => api.put(`/absences/api/categories/${id}`, payload),
  deleteCategory: (id: number) => api.del(`/absences/api/categories/${id}`),
  hardDeleteCategory: (id: number) => api.del(`/absences/api/categories/${id}/permanent`),

  // approvers
  listApprovers: (workerId: string) => api.get<{ approvers: ApproverOption[] }>(`/absences/api/workers/${workerId}/approvers`),
  addApprover: (workerId: string, approverWorkerId: string) =>
    api.post(`/absences/api/workers/${workerId}/approvers`, { approver_worker_id: approverWorkerId }),
  removeApprover: (workerId: string, approverWorkerId: string) =>
    api.del(`/absences/api/workers/${workerId}/approvers/${approverWorkerId}`),

  // balances / limits / adjustments
  balancesSummary: () => api.get<{ balances: Record<string, unknown> }>('/absences/api/balances/summary'),
  workerBalances: (workerId: string) =>
    api.get<{ balances: AbsenceBalance[]; worker_name: string }>(`/absences/api/workers/${workerId}/balances`),
  setLimit: (workerId: string, category_id: number, max_value: number, notes?: string | null) =>
    api.post(`/absences/api/workers/${workerId}/limits`, { category_id, max_value, notes }),
  removeLimit: (workerId: string, limitId: number) => api.del(`/absences/api/workers/${workerId}/limits/${limitId}`),
  listAdjustments: (workerId: string) =>
    api.get<{ adjustments: AbsenceAdjustment[] }>(`/absences/api/workers/${workerId}/adjustments`),
  createAdjustment: (workerId: string, category_id: number, delta_value: number, reason: string, period_label?: string | null) =>
    api.post(`/absences/api/workers/${workerId}/adjustments`, { category_id, delta_value, reason, period_label }),
  deleteAdjustment: (workerId: string, adjId: number) => api.del(`/absences/api/workers/${workerId}/adjustments/${adjId}`),
  balanceAudit: (workerId: string) =>
    api.get<{ entries: AbsenceAuditEntry[] }>(`/absences/api/workers/${workerId}/balance-audit`),
};
