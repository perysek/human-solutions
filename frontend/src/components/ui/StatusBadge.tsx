import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface StatusBadgeProps {
  /** Also doubles as the `.status-badge` modifier class (active/inactive/…). */
  status: string;
  children: ReactNode;
}

/**
 * `.status-badge` wrapper that pops (reusing the permission-tile
 * `tile-check-pop` keyframe) whenever `status` changes after the initial
 * mount — gives in-place status flips (deactivate, mark complete, …) the
 * same "yes, that registered" feedback a full page reload gets for free.
 */
export function StatusBadge({ status, children }: StatusBadgeProps) {
  const prevStatus = useRef(status);
  const [pulsing, setPulsing] = useState(false);

  useEffect(() => {
    if (prevStatus.current === status) return;
    prevStatus.current = status;
    setPulsing(true);
    const t = window.setTimeout(() => setPulsing(false), 250);
    return () => window.clearTimeout(t);
  }, [status]);

  return <span className={`status-badge ${status}${pulsing ? ' status-badge-pulse' : ''}`}>{children}</span>;
}
