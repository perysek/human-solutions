import type { ActionPlanStatus } from '@/lib/api/actionPlans';

export interface ActionPlanStatusOption {
  value: ActionPlanStatus;
  label: string;
  color: string;
  background: string;
}

/** Single source of truth for the 4 action-plan statuses' label + color —
 * shared by ActionPlanModal's colored StatusSelect and ActionPlansPage's
 * status badges/filter, so the two never drift out of sync. Reuses the
 * app's existing status-color tokens (tokens.css) where a fit exists
 * (Zdefiniowane~scheduled, W trakcie~in-progress, Zakończone~completed);
 * "Skuteczne" (verified effective, a step past "done") has no existing
 * token, so teal keeps it visually distinct from Zakończone's green
 * rather than reusing/shading it. */
export const ACTION_PLAN_STATUS_OPTIONS: ActionPlanStatusOption[] = [
  { value: 'defined', label: 'Zdefiniowane', color: 'var(--color-status-scheduled)', background: 'var(--color-status-scheduled-bg)' },
  { value: 'in_progress', label: 'W trakcie', color: 'var(--color-status-in-progress)', background: 'var(--color-status-in-progress-bg)' },
  { value: 'completed', label: 'Zakończone', color: 'var(--color-status-completed)', background: 'var(--color-status-completed-bg)' },
  { value: 'effective', label: 'Skuteczne', color: 'var(--color-chart-teal)', background: 'rgba(20, 184, 166, 0.1)' },
];
