import type { ReactNode } from 'react';
import { PageHeader } from './PageHeader';
import { EmptyState } from './EmptyState';

interface PlaceholderPageProps {
  title: string;
  subtitle?: string;
  icon: string;
  message: string;
  children?: ReactNode;
}

/**
 * Pattern-A refined list page (GUI-GOLDEN-BOOK §9) with an empty-state body
 * standing in for the not-yet-built view. Swap the <EmptyState>/children
 * body for a real <table class="refined-table"> + <SortableTh> once the
 * module is implemented — the page chrome (header, table-container) is
 * already wired to the design system.
 */
export function PlaceholderPage({ title, subtitle, icon, message, children }: PlaceholderPageProps) {
  return (
    <div className="refined-page">
      <PageHeader title={title} subtitle={subtitle} />
      <div className="table-container" style={{ flex: 1 }}>
        {children ?? <EmptyState icon={icon} title="Widok w przygotowaniu" message={message} />}
      </div>
    </div>
  );
}
