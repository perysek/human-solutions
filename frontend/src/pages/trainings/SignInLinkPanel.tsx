import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/lib/icons/Icon';
import { useApiData } from '@/lib/api/useApiData';
import { trainingsApi, type SignInLinkCreated } from '@/lib/api/trainings';
import { useToast } from '@/lib/feedback/ToastProvider';
import { useConfirm } from '@/lib/feedback/ConfirmProvider';

interface SignInLinkPanelProps {
  trainingId: number;
  /** Called after generate/revoke so ParticipantsTable's ✓ column and the
   * confirmed/total count here both reflect the new state — same lift-and-
   * share pattern as TrainingViewPage's other reload callbacks. */
  onConfirmationsChanged: () => void;
}

/** MOBILE_PRESENCE_CONFIRMATION_PLAN.md §5.4 — "Lista obecności" panel:
 * generate/revoke the mobile sign-in QR for this training's session, and
 * show the live confirmed/total count. Replaces printing the participants
 * list for a wet signature. */
export function SignInLinkPanel({ trainingId, onConfirmationsChanged }: SignInLinkPanelProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data: status, loading, reload } = useApiData(() => trainingsApi.getSignInLink(trainingId), [trainingId]);
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState<SignInLinkCreated | null>(null);

  async function handleGenerate() {
    if (status?.active) {
      const ok = await confirm({
        title: 'Wygenerować nowy link?',
        message: 'Obecny link/kod QR przestanie działać — osoby, które jeszcze nie potwierdziły obecności, będą musiały zeskanować nowy kod.',
        confirmText: 'Generuj nowy',
      });
      if (!ok) return;
    }
    setCreating(true);
    try {
      const result = await trainingsApi.createSignInLink(trainingId);
      setJustCreated(result);
      toast.success('Link do potwierdzenia obecności wygenerowany.');
      reload();
      onConfirmationsChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się wygenerować linku.');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke() {
    const ok = await confirm({
      title: 'Unieważnić link?',
      message: 'Kod QR/link przestanie działać natychmiast — nikt nie będzie mógł już nim potwierdzić obecności.',
      confirmText: 'Unieważnij',
      type: 'danger',
    });
    if (!ok) return;
    try {
      await trainingsApi.revokeSignInLink(trainingId);
      toast.success('Link unieważniony.');
      setJustCreated(null);
      reload();
      onConfirmationsChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nie udało się unieważnić linku.');
    }
  }

  return (
    <div className="form-card animate-fade-up">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold" style={{ color: 'var(--color-ink)' }}>
          Lista obecności (mobilna)
        </h2>
        {!loading && status && (
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-ink-subtle)' }}>
            Potwierdzono: {status.confirmed}/{status.total}
          </span>
        )}
      </div>

      {loading ? (
        <p style={{ color: 'var(--color-ink-subtle)', fontSize: '0.875rem' }}>Ładowanie…</p>
      ) : (
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {justCreated && (
            <div style={{ textAlign: 'center' }}>
              <img
                src={`data:image/png;base64,${justCreated.qr_png_base64}`}
                alt="Kod QR do potwierdzenia obecności"
                style={{ width: 160, height: 160, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md, 8px)' }}
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--color-ink-subtle)', marginTop: '0.375rem', maxWidth: 160, wordBreak: 'break-all' }}>
                {justCreated.url}
              </p>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-ink-muted)' }}>
              {status?.active
                ? 'Link jest aktywny — wyświetl kod QR uczestnikom, aby potwierdzili obecność telefonem.'
                : 'Brak aktywnego linku. Wygeneruj kod QR, aby zastąpić papierową listę obecności.'}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="primary" onClick={handleGenerate} disabled={creating}>
                <Icon name="badge" size={16} />
                {status?.active ? 'Generuj nowy' : 'Generuj link'}
              </Button>
              {status?.active && (
                <Button type="button" variant="danger" onClick={handleRevoke} disabled={creating}>
                  Unieważnij
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
