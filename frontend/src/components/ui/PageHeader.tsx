import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Matches the `view-transition-name` set on the row this detail page was
   * opened from (see WorkersListPage's name cell) so the row text morphs
   * into the subtitle instead of hard-cross-fading with the rest of the page. */
  subtitleViewTransitionName?: string;
  actions?: ReactNode;
}

/** Matches input.css .page-header / .page-title / .page-subtitle / .page-header-actions. */
export function PageHeader({ title, subtitle, subtitleViewTransitionName, actions }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && (
          <p
            className="page-subtitle"
            style={subtitleViewTransitionName ? ({ viewTransitionName: subtitleViewTransitionName } as React.CSSProperties) : undefined}
          >
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  );
}
