import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useApiData } from '@/lib/api/useApiData';
import { trainingsApi } from '@/lib/api/trainings';
import { useAuth } from '@/lib/auth/AuthContext';
import { useEscapeAction } from '@/lib/a11y/useEscapeAction';
import { useConfirm } from '@/lib/feedback/ConfirmProvider';
import { useToast } from '@/lib/feedback/ToastProvider';
import { TrainingJobsSection } from './TrainingJobsSection';
import { TrainingSkillsSection } from './TrainingSkillsSection';
import { TrainingTrainersSection } from './TrainingTrainersSection';
import { ParticipantsTable } from './ParticipantsTable';
import { SignInLinkPanel } from './SignInLinkPanel';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <label className="stat-label block mb-1">{label}</label>
      <p style={{ color: 'var(--color-ink)', fontSize: '0.9375rem' }}>{value}</p>
    </div>
  );
}

export function TrainingViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const { user, hasRole } = useAuth();
  const trainingId = Number(id);
  useEscapeAction(() => navigate('/trainings'));

  const { data: training, loading, error } = useApiData(() => trainingsApi.get(trainingId), [trainingId]);
  const { data: participantsData, loading: participantsLoading, reload: reloadParticipants } = useApiData(
    () => trainingsApi.getParticipants(trainingId),
    [trainingId],
  );
  const participants = participantsData?.participants ?? [];

  // Lifted here (not fetched independently inside each section) so
  // TrainingSkillsSection's skill dropdown reacts immediately when
  // TrainingJobsSection adds/removes a job link — two sibling components,
  // each fetching its own copy, would leave one stale after the other's edit.
  // Same reasoning applies the other way round now that TrainingJobsSection's
  // own dropdown is scoped by linked skills (Task 6's reciprocal filtering) —
  // so skill links are lifted here too, not fetched inside TrainingSkillsSection.
  const { data: jobLinksData, loading: jobLinksLoading, reload: reloadJobLinks } = useApiData(
    () => trainingsApi.getJobLinks(trainingId),
    [trainingId],
  );
  const jobLinks = jobLinksData?.jobs ?? [];

  const { data: skillLinksData, loading: skillLinksLoading, reload: reloadSkillLinks } = useApiData(
    () => trainingsApi.getSkillLinks(trainingId),
    [trainingId],
  );
  const skillLinks = skillLinksData?.skills ?? [];

  // Task 2 — trainer moved from training_participants to its own link table
  // (training_trainers). Fetched unconditionally (not gated on fullAccess)
  // for the same reason jobLinks/skillLinks are: isOwnerTrainer below needs
  // it regardless of role, and GET trainer-links is deliberately broader
  // than job-links/skill-links' admin-only gate (see routes/trainings/routes.py's
  // api_get_trainer_links docstring) so a `trainer` can actually fetch it.
  const { data: trainerLinksData, loading: trainerLinksLoading, reload: reloadTrainerLinks } = useApiData(
    () => trainingsApi.getTrainerLinks(trainingId),
    [trainingId],
  );
  const trainerLinks = trainerLinksData?.trainers ?? [];

  const fullAccess = hasRole('superadmin', 'hr_manager');
  // TRN_7: `trainer` may edit only a training they already run — mirrors
  // services/training_service.assert_trainer_can_edit exactly (see
  // ParticipantsTable's docstring for the bootstrapping nuance this implies).
  const isOwnerTrainer = user?.role === 'trainer' && trainerLinks.some((l) => l.trainer_id === user.workerId);
  const canEdit = fullAccess || isOwnerTrainer;

  async function handleDelete() {
    if (!training) return;
    const ok = await confirm({
      title: 'Usunąć szkolenie?',
      message: `Szkolenie "${training.description}" oraz wszystkie zapisy uczestników zostaną trwale usunięte.`,
      confirmText: 'Usuń',
      type: 'danger',
    });
    if (!ok) return;
    try {
      await trainingsApi.remove(training.id);
      toast.success('Szkolenie usunięte.');
      navigate('/trainings');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się usunąć szkolenia.');
    }
  }

  return (
    <div className="refined-page">
      {/* Wider than the standard 60rem .form-page-shell (still centered the
          same way): the Uczestnicy table's 7 columns of inline-editable
          cells — unlike TrainingForm's fields — genuinely need the extra
          room; at 60rem "Uwagi" was truncating to 3-4 visible characters. */}
      <div className="form-page-shell" style={{ maxWidth: '64rem' }}>
        <PageHeader
          title="Szkolenie"
          subtitle={training?.description}
          actions={
            <>
              <Button variant="secondary" onClick={() => navigate('/trainings')}>
                Wróć do listy
              </Button>
              {training && fullAccess && (
                <Button variant="danger" onClick={handleDelete}>
                  Usuń
                </Button>
              )}
              {training && canEdit && (
                <Button variant="primary" onClick={() => navigate(`/trainings/${training.id}/edit`)}>
                  Edytuj
                </Button>
              )}
            </>
          }
        />

        {loading ? (
          <p className="page-subtitle">Ładowanie…</p>
        ) : error || !training ? (
          <EmptyState icon="error" title="Nie znaleziono szkolenia" message={error ?? undefined} />
        ) : (
          <div className="space-y-4">
            <div className="form-card animate-fade-up">
              <div className="form-grid">
                <Field label="Nazwa" value={training.description} />
                <Field label="Data szkolenia" value={training.training_date ? new Date(training.training_date).toLocaleDateString('pl-PL') : '—'} />
                <Field label="Stopień ukończenia" value={training.completion !== null ? `${training.completion}%` : '—'} />
                <Field label="Uwagi" value={training.remarks ?? '—'} />
                <div className="form-field-full">
                  <Field label="Szczegóły szkolenia" value={training.training_details ?? '—'} />
                </div>
                <div className="form-field-full">
                  <Field label="Dokumenty referencyjne" value={training.related_docs ?? '—'} />
                </div>
              </div>
            </div>

            {/* Task 2 — trainer-links PUT is admin-only (mirrors Jobs/Skills'
                own gate), placed first since "who runs it" is more basic
                training info than the job/skill links below it. */}
            {fullAccess && (
              <TrainingTrainersSection
                trainingId={training.id}
                trainerLinks={trainerLinks}
                loading={trainerLinksLoading}
                reload={reloadTrainerLinks}
              />
            )}

            {/* TRN_3/4 — job-links/skill-links routes gate on role_required('superadmin', 'hr_manager'),
                not module access — `trainer`/`viewer` never reach these endpoints. */}
            {fullAccess && (
              <TrainingJobsSection
                trainingId={training.id}
                jobLinks={jobLinks}
                loading={jobLinksLoading}
                reload={reloadJobLinks}
                onParticipantsChanged={reloadParticipants}
                linkedSkillIds={skillLinks.map((l) => l.skill_id)}
              />
            )}
            {fullAccess && (
              <TrainingSkillsSection
                trainingId={training.id}
                skillLinks={skillLinks}
                loading={skillLinksLoading}
                reload={reloadSkillLinks}
                linkedJobIds={jobLinks.map((l) => l.job_id)}
              />
            )}

            {/* MOBILE_PRESENCE_CONFIRMATION_PLAN.md §5.4 — same ownership
                gate as the sign-in-link endpoints themselves
                (module_permission_required('trainings') +
                assert_trainer_can_edit), mirrored client-side by canEdit. */}
            {canEdit && <SignInLinkPanel trainingId={training.id} onConfirmationsChanged={reloadParticipants} />}

            <ParticipantsTable
              trainingId={training.id}
              participants={participants}
              loading={participantsLoading}
              reload={reloadParticipants}
              canManage={canEdit}
            />
          </div>
        )}
      </div>
    </div>
  );
}
