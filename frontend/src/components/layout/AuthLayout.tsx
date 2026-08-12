import type { ReactNode } from 'react';

/** Matches base.html's unauthenticated branch: a full-height centered column. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-center min-h-screen" style={{ background: 'var(--color-surface-warm)' }}>
      {children}
    </div>
  );
}
