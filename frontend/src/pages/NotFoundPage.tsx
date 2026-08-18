import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/ui/EmptyState';

export function NotFoundPage() {
  return (
    <div style={{ padding: '3rem 1.5rem' }}>
      <EmptyState
        icon="search"
        title="404 — nie znaleziono strony"
        message="Sprawdź adres albo wróć do profilu."
        action={
          <Link to="/profile" className="form-btn-primary">
            Wróć do profilu
          </Link>
        }
      />
    </div>
  );
}
