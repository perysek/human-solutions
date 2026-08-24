/** "Szkolenia wstępne" badge — derives the 3-state label/color/% from
 * WorkerListItem's `onboarding_completed`/`onboarding_completion_pct`
 * (worker_onboarding_status, joined by the worker's current job_id). Reuses
 * StatusBadge's existing `.status-badge` modifier classes (active/on-leave/
 * inactive) rather than introducing new CSS — no new visual language for
 * "done/in progress/not started" is needed, those three already exist. */
export interface OnboardingBadgeInfo {
  label: string;
  /** StatusBadge `status` prop. */
  status: 'active' | 'on-leave' | 'inactive';
  /** null only for "Nie zaplanowane" — nothing to show a % of yet. */
  pct: number | null;
}

export function onboardingBadgeInfo(completed: boolean | null, pct: number | null): OnboardingBadgeInfo {
  if (completed == null) return { label: 'Nie zaplanowane', status: 'inactive', pct: null };
  if (completed) return { label: 'Zakończone', status: 'active', pct: 100 };
  return { label: 'W trakcie', status: 'on-leave', pct: pct ?? 0 };
}
