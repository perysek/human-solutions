/**
 * UI-fixes-08092026 task1/2/3 — single source of truth for the five
 * "needs attention" categories WorkersListPage surfaces as stat cards (the
 * multi-select filter), and as badges in the "Alerty" column. Keys must
 * match WorkerRepository._ALERT_CATEGORY_SQL (backend) exactly — they're
 * used verbatim as `alert_categories` filter values and as `alerts[]`
 * entries on WorkerListItem.
 */
export type WorkerAlertCategory = 'gap' | 'medical' | 'bhp' | 'onboarding_overdue' | 'foreigner_doc';

export const WORKER_ALERT_CATEGORIES: WorkerAlertCategory[] = [
  'gap',
  'medical',
  'bhp',
  'onboarding_overdue',
  'foreigner_doc',
];

export interface WorkerAlertInfo {
  /** Stat card label. */
  cardLabel: string;
  /** Shorter label for the "Alerty" column badge's tooltip/aria-label. */
  badgeLabel: string;
  icon: string;
  /** 'error' (expired/non-compliant records — medical, bhp, foreigner
   * documents) vs 'orange' (developmental gaps — competency, onboarding). */
  tone: 'error' | 'orange';
}

export const WORKER_ALERT_INFO: Record<WorkerAlertCategory, WorkerAlertInfo> = {
  gap: { cardLabel: 'Luka kompetencyjna', badgeLabel: 'Luka kompetencyjna', icon: 'checklist', tone: 'orange' },
  medical: { cardLabel: 'Wygasłe badania lekarskie', badgeLabel: 'Wygasłe badanie lekarskie', icon: 'warning', tone: 'error' },
  bhp: { cardLabel: 'Wygasłe szkolenia BHP', badgeLabel: 'Wygasłe szkolenie BHP', icon: 'warning', tone: 'error' },
  onboarding_overdue: {
    cardLabel: 'Zaległe szkolenia wstępne',
    badgeLabel: 'Zaległe szkolenie wstępne',
    icon: 'event_busy',
    tone: 'orange',
  },
  foreigner_doc: {
    cardLabel: 'Wygasłe dokumenty cudzoziemca',
    badgeLabel: 'Wygasły dokument cudzoziemca',
    icon: 'badge',
    tone: 'error',
  },
};
