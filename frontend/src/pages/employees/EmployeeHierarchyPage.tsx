import { PageHeader } from '@/components/ui/PageHeader';
import { Icon } from '@/lib/icons/Icon';

const PLAN_ITEMS = [
  {
    icon: 'category',
    title: 'Struktura organizacyjna',
    body: 'Departments/Teams jako drzewo (parent_id), niezależne od hierarchii przełożonych — pozwala grupować pracowników bez wymuszania relacji raportowania.',
  },
  {
    icon: 'badge',
    title: 'Poziomy i stanowiska',
    body: 'JobLevel (np. Junior/Mid/Senior/Lead) osobno od position (etykieta stanowiska) — position pozostaje opisowe, level napędza uprawnienia/raporty.',
  },
  {
    icon: 'people',
    title: 'Hierarchia przełożonych',
    body: 'Rozbudowa istniejącego EmployeeSupervisor (M:M) o typ relacji (direct/dotted-line) i datę obowiązywania — dziś to płaska tabela bez historii.',
  },
  {
    icon: 'person_search',
    title: 'Zastępstwa',
    body: 'EmployeeSubstitute: kto zastępuje kogo, w jakim zakresie (wszystkie obowiązki / tylko akceptacje wniosków) i w jakim oknie czasowym.',
  },
  {
    icon: 'checklist',
    title: 'Opisy stanowisk',
    body: 'JobDescription per stanowisko/poziom: zakres obowiązków, wymagania — wersjonowane, żeby zmiana opisu nie nadpisywała historii.',
  },
  {
    icon: 'star',
    title: 'Macierze kompetencji',
    body: 'SkillMatrix per dział: umiejętność × wymagany poziom × poziom pracownika — do planowania szkoleń i obsady zmian.',
  },
];

/**
 * Placeholder for the employee-hierarchy / org-chart module. The reference
 * project's database/models.py has a #TODO-CLAUDE comment on
 * EmployeeSupervisor asking for exactly this: a proper org-chart model
 * (hierarchy, levels, teams, substitutes, job descriptions, skill matrices).
 * This page is intentionally not implemented yet — see frontend/README.md
 * "Employee hierarchy — implementation plan" for the full write-up this
 * summarizes.
 */
export function EmployeeHierarchyPage() {
  return (
    <div className="refined-page">
      <PageHeader title="Hierarchia pracowników" subtitle="Struktura organizacyjna, przełożeni, zastępstwa, kompetencje" />

      <div className="form-card animate-fade-up mb-6">
        <p className="text-sm" style={{ color: 'var(--color-ink-muted)' }}>
          Ten moduł wymaga planu wdrożenia zanim powstanie UI — patrz komentarz{' '}
          <code className="dev-helper-code">#TODO-CLAUDE</code> przy <code className="dev-helper-code">EmployeeSupervisor</code> w{' '}
          <code className="dev-helper-code">database/models.py</code>. Poniżej zarys tego, co ten moduł powinien objąć; pełny opis
          — w <code className="dev-helper-code">frontend/README.md</code>.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {PLAN_ITEMS.map((item) => (
          <div key={item.title} className="form-card animate-fade-up">
            <div className="flex items-center gap-2 mb-2">
              <span
                className="w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center shrink-0"
                style={{ background: 'var(--color-accent-muted)', color: 'var(--color-accent)' }}
              >
                <Icon name={item.icon} size={18} />
              </span>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--color-ink)' }}>
                {item.title}
              </h3>
            </div>
            <p className="text-sm" style={{ color: 'var(--color-ink-muted)' }}>
              {item.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
