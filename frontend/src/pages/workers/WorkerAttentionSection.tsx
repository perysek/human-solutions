import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/lib/icons/Icon';
import { useApiData } from '@/lib/api/useApiData';
import { workersApi } from '@/lib/api/workers';
import { medicalApi } from '@/lib/api/medical';
import { bhpApi } from '@/lib/api/bhp';
import { tableHasValidRow } from '@/lib/expiryStatus';
import { ActionPlanModal, type ActionPlanSeed } from '@/components/workers/ActionPlanModal';

const EMPTY_MEDICAL = { exams: [], count: 0 };
const EMPTY_BHP = { trainings: [], count: 0 };

interface AttentionIssue {
  key: string;
  description: string;
  onNavigate: () => void;
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** task3 — "Wymaga uwagi": every open issue for this worker (competence
 * gap, no currently-valid BHP training, no currently-valid medical exam),
 * each with a "Przejdź do →" that either opens the same action-plan modal
 * CompetencyGapsReportPage uses (gap issues) or scrolls to the relevant
 * section below (medical/bhp issues) — matches WorkersListPage's
 * `needs_attention` badge definition exactly (see worker_repository.py's
 * _NEEDS_ATTENTION_SQL), so a flagged row on the list always has a
 * non-empty section here. Renders nothing when there are no issues. */
export function WorkerAttentionSection({
  workerId,
  workerName,
  canSeeMedical,
  canSeeBhp,
}: {
  workerId: string;
  workerName: string;
  canSeeMedical: boolean;
  canSeeBhp: boolean;
}) {
  const { data: gapData, reload: reloadGaps } = useApiData(() => workersApi.getGapAnalysis(workerId), [workerId]);
  const { data: medicalData } = useApiData(
    () => (canSeeMedical ? medicalApi.listForWorker(workerId) : Promise.resolve(EMPTY_MEDICAL)),
    [workerId, canSeeMedical],
  );
  const { data: bhpData } = useApiData(
    () => (canSeeBhp ? bhpApi.listForWorker(workerId) : Promise.resolve(EMPTY_BHP)),
    [workerId, canSeeBhp],
  );
  const [actionSeed, setActionSeed] = useState<ActionPlanSeed | null>(null);

  const gaps = useMemo(() => (gapData?.gaps ?? []).filter((g) => g.gap > 0), [gapData]);
  const exams = useMemo(() => medicalData?.exams ?? [], [medicalData]);
  const trainings = useMemo(() => bhpData?.trainings ?? [], [bhpData]);

  const medicalExpired = exams.length > 0 && !tableHasValidRow(exams);
  const bhpExpired = trainings.length > 0 && !tableHasValidRow(trainings);

  // "Ostatnie wygasło …" references the most-recently-expired record (the
  // one that would still be current if it hadn't lapsed), not just any row.
  const lastExpiredMedical = useMemo(
    () => (medicalExpired ? [...exams].sort((a, b) => (b.valid_until ?? '').localeCompare(a.valid_until ?? ''))[0] : null),
    [medicalExpired, exams],
  );
  const lastExpiredBhp = useMemo(
    () => (bhpExpired ? [...trainings].sort((a, b) => (b.valid_until ?? '').localeCompare(a.valid_until ?? ''))[0] : null),
    [bhpExpired, trainings],
  );

  const issues: AttentionIssue[] = [
    ...gaps.map((g) => ({
      key: `gap-${g.skill_id}`,
      description: `Luka kompetencyjna — ${g.skill_description}: wymagany poziom ${g.required_rating}, posiadany ${g.current_rating ?? 'brak oceny'}.`,
      onNavigate: () => setActionSeed({ workerId, workerName, skillId: g.skill_id, skillDescription: g.skill_description }),
    })),
    ...(medicalExpired
      ? [
          {
            key: 'medical',
            description: `Badania lekarskie — brak ważnego badania${
              lastExpiredMedical?.valid_until ? ` (ostatnie wygasło ${new Date(lastExpiredMedical.valid_until).toLocaleDateString('pl-PL')})` : ''
            }.`,
            onNavigate: () => scrollToSection('worker-medical-section'),
          },
        ]
      : []),
    ...(bhpExpired
      ? [
          {
            key: 'bhp',
            description: `Szkolenia BHP — brak ważnego szkolenia${
              lastExpiredBhp?.valid_until ? ` (ostatnie wygasło ${new Date(lastExpiredBhp.valid_until).toLocaleDateString('pl-PL')})` : ''
            }.`,
            onNavigate: () => scrollToSection('worker-bhp-section'),
          },
        ]
      : []),
  ];

  if (issues.length === 0) return null;

  return (
    <div className="form-card animate-fade-up" style={{ borderColor: 'rgba(154, 103, 0, 0.35)' }}>
      <h2 className="text-base font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--color-ink)' }}>
        <Icon name="warning" size={18} style={{ color: 'var(--color-warning)' }} />
        Wymaga uwagi
      </h2>
      <ul className="space-y-2">
        {issues.map((issue) => (
          <li
            key={issue.key}
            className="flex items-center justify-between gap-3"
            style={{ padding: '0.625rem 0.75rem', background: 'rgba(154, 103, 0, 0.06)', borderRadius: '0.5rem' }}
          >
            <span style={{ fontSize: '0.875rem', color: 'var(--color-ink)' }}>{issue.description}</span>
            <Button type="button" variant="secondary" small onClick={issue.onNavigate}>
              Przejdź do →
            </Button>
          </li>
        ))}
      </ul>
      {actionSeed && <ActionPlanModal seed={actionSeed} onClose={() => setActionSeed(null)} onSaved={reloadGaps} />}
    </div>
  );
}
