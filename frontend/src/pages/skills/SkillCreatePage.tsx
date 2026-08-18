import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { SkillForm } from './SkillForm';

export function SkillCreatePage() {
  const navigate = useNavigate();
  return (
    <div className="refined-page">
      <PageHeader title="Nowa umiejętność" subtitle="Dodaj umiejętność do słownika" />
      <SkillForm mode="create" onSaved={() => navigate('/skills')} onCancel={() => navigate('/skills')} />
    </div>
  );
}
