import type { ReactNode } from 'react';
import { Icon } from '@/lib/icons/Icon';

interface EmptyStateProps {
  icon: string;
  title: string;
  message?: string;
  action?: ReactNode;
}

/** Matches scrollable_table.html's empty_state() macro contract. */
export function EmptyState({ icon, title, message, action }: EmptyStateProps) {
  return (
    <div className="empty-state animate-fade-in">
      <div className="empty-icon">
        <Icon name={icon} size={64} />
      </div>
      <p className="font-medium mb-1" style={{ color: 'var(--color-ink)' }}>
        {title}
      </p>
      {message && <p className="empty-text">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
