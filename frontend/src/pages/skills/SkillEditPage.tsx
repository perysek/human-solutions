import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { useApiData } from '@/lib/api/useApiData';
import { skillsApi } from '@/lib/api/skills';
import { SkillForm } from './SkillForm';

export function SkillEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: skill, loading, error } = useApiData(() => skillsApi.get(id as string), [id]);

  return (
    <div className="refined-page">
      <div className="form-page-shell">
        <PageHeader title="Edytuj umiejętność" subtitle={skill?.id} />
        {loading ? (
          <p className="page-subtitle">Ładowanie…</p>
        ) : error || !skill ? (
          <EmptyState icon="error" title="Nie znaleziono umiejętności" message={error ?? undefined} />
        ) : (
          <SkillForm mode="edit" initial={skill} onSaved={() => navigate('/skills')} onCancel={() => navigate('/skills')} />
        )}
      </div>
    </div>
  );
}
