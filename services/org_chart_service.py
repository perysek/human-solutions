"""
Złożenie drzewa organizacyjnego + humanizacja pending-changes/rewizji na
etykiety PL — ORG_CHART_PROPOSAL.md §3b/§3e, rozszerzone o ręczne tworzenie
rewizji (migracja d6d10b667838 usunęła trigger bump_org_chart_revision()).

Read-only assembly across DepartmentRepository/JobRepository/WorkerRepository
— żadna z tych tabel nie jest właścicielem "wykresu organizacyjnego", więc ta
logika nie jest przypięta do jednego z tych repository (to samo rozumowanie
co dashboard_service.py's własne podsumowanie wielo-repozytoryjne).

Drzewo jest w całości WYLICZANE przy odczycie, nigdy nie przechowywane — patrz
migracji 8f053c175547 docstring, dlaczego ta zasada tu obowiązuje. To dlatego
"podgląd zmian" (NewRevisionModal's press-and-hold) w ogóle nie potrzebuje
osobnej logiki "zastosuj rewizję hipotetycznie" — departments/jobs są już
zapisane na żywo w chwili edycji, rewizja jest tylko potwierdzeniem faktu;
podgląd to zwykłe get_org_chart_tree(), to samo drzewo co strona główna.
"""
from collections import defaultdict
from typing import Any, Dict, List, Optional

from exceptions import ValidationError
from repositories.departments.department_repository import DepartmentRepository
from repositories.jobs.job_repository import JobRepository
from repositories.org_chart.org_chart_revision_repository import OrgChartRevisionRepository
from repositories.workers.worker_repository import WorkerRepository

# field_name (audit_log) -> etykieta PL. Te same cztery pola co dawny
# trigger bump_org_chart_revision() wykrywał (migracje 0811375b3298,
# cab974083e2c) — patrz org_chart_revision_repository._PENDING_CHANGES_WHERE
# dla dokładnej listy (entity_type, action, field_name) liczących się jako
# strukturalne.
_FIELD_LABELS = {
    'is_managerial': 'Zmiana kierownika działu',
    'is_director': 'Zmiana Dyrektora zakładu',
    'department_id': 'Przeniesienie stanowiska do innego działu',
    'parent_department_id': 'Zmiana struktury działów',
}


def _department_names_by_id() -> Dict[int, str]:
    """Wszystkie działy naraz, id -> name — pending changes mogą zawierać
    wiele wierszy parent_department_id/department_id; jedno zapytanie
    zamiast N+1 SELECT-ów per wiersz przy budowaniu opisu 'było -> jest'."""
    return {d['id']: d['name'] for d in DepartmentRepository().get_all()}


def _describe_pending_change(row: Any, dept_names: Dict[int, str]) -> str:
    """Jeden wiersz audit_log (już przefiltrowany przez
    OrgChartRevisionRepository.list_pending_changes/_PENDING_CHANGES_WHERE do
    tego, co strukturalne) -> czytelny opis 'było -> jest' po polsku, do
    listy w NewRevisionModal. Nigdy nie rzuca na nieoczekiwany kształt —
    degraduje do action/field_name surowego, tak samo defensywnie jak dawne
    _humanize_trigger_source."""
    label = row.get('entity_label') or str(row.get('entity_id'))

    def dept_name(raw_id: Optional[str]) -> str:
        if raw_id in (None, 'None'):
            return '— (najwyższy poziom)'
        try:
            return dept_names.get(int(raw_id), f'dział ID {raw_id}')
        except (TypeError, ValueError):
            return str(raw_id)

    if row['entity_type'] == 'department':
        if row['action'] == 'CREATE':
            return f'Dodano dział „{label}”'
        if row['action'] == 'DELETE':
            return f'Usunięto dział „{label}”'
        if row['field_name'] == 'parent_department_id':
            return f'Dział „{label}”: {dept_name(row["old_value"])} → {dept_name(row["new_value"])}'

    if row['entity_type'] == 'job':
        if row['field_name'] == 'department_id':
            return f'Stanowisko „{label}”: {dept_name(row["old_value"])} → {dept_name(row["new_value"])}'
        if row['field_name'] == 'is_managerial':
            return (f'Stanowisko „{label}” ustawione jako kierownicze' if row['new_value'] == 'True'
                    else f'Stanowisku „{label}” odebrano status kierowniczy')
        if row['field_name'] == 'is_director':
            return (f'Stanowisko „{label}” ustawione jako Dyrektor zakładu' if row['new_value'] == 'True'
                    else f'Stanowisku „{label}” odebrano status Dyrektora zakładu')
        if row['field_name'] == 'org_chart_structural_delete':
            return f'Usunięto stanowisko kierownicze/Dyrektora „{label}”'

    return f'{row["entity_type"]}:{label}:{row["action"]}:{row.get("field_name") or ""}'


def get_pending_changes() -> List[Dict[str, Any]]:
    """Lista zmian struktury oczekujących na nową rewizję — NewRevisionModal
    pokazuje to jako listę do przejrzenia przed 'Utwórz rewizję'."""
    dept_names = _department_names_by_id()
    rows = OrgChartRevisionRepository().list_pending_changes()
    return [
        {
            'id': row['id'],
            'description': _describe_pending_change(row, dept_names),
            'changed_by': row['user_name'] or 'System',
            'changed_at': row['changed_at'].isoformat() if row.get('changed_at') else None,
        }
        for row in rows
    ]


def create_revision(user_id: Optional[int], user_name: Optional[str]) -> Dict[str, Any]:
    """Zatwierdza WSZYSTKIE aktualnie oczekujące zmiany jako jedną nową
    rewizję (NewRevisionModal's 'Utwórz rewizję'). Rzuca ValidationError,
    jeśli nic nie jest oczekujące — modal disable'uje ten przycisk w tym
    stanie, ale endpoint sam też się broni (nie ufa wyłącznie stanowi UI)."""
    revision_id = OrgChartRevisionRepository().create_revision(user_id, user_name)
    if revision_id is None:
        raise ValidationError('Brak zmian do zatwierdzenia.')
    latest = OrgChartRevisionRepository().get_latest()
    return humanize_revision(latest)


def humanize_revision(row: Any) -> Dict[str, Any]:
    """{id, revised_at, label, created_by} — the shape
    routes/org_chart/routes.py hands the frontend for one org_chart_revisions
    row, whether that's the single 'latest' badge or one row of the
    paginated history table. `label` used to translate the trigger's raw
    fingerprint (pre-d6d10b667838); a manually-created revision's `summary`
    is already human-written (org_chart_revision_repository._pluralize_changes),
    so this just passes it through."""
    return {
        'id': row['id'],
        'revised_at': row['revised_at'].isoformat() if row.get('revised_at') else None,
        'label': row.get('summary') or '',
        'created_by': row.get('created_by_user_name'),
    }


def _worker_entry(worker: Any) -> Dict[str, Any]:
    return {'id': worker['id'], 'full_name': f"{worker['firstname']} {worker['surname']}"}


def capture_pending_change_delta(before_audit_id: Optional[int]) -> Optional[Dict[str, Any]]:
    """Toast after every org-structure DB update — compare `before_audit_id`
    (an OrgChartRevisionRepository.get_latest_audit_id() snapshot the caller
    takes immediately BEFORE its own mutation) against the pending-changes
    list now. Returns a humanized description of the just-recorded change if
    the mutation added a new structural audit_log row, or None if nothing
    structural changed — e.g. a job's description-only edit, or a
    job-position INSERT (deliberately excluded, see migration
    0811375b3298's docstring, still honoured by
    OrgChartRevisionRepository's whitelist).

    Same "re-derive from the single source of truth, don't trust a flag the
    caller passes in" shape as the pre-d6d10b667838 capture_revision_delta
    had — just pointed at audit_log/list_pending_changes instead of
    org_chart_revisions, since audit_log is now that source of truth.
    """
    if before_audit_id is None:
        return None
    pending = OrgChartRevisionRepository().list_pending_changes()
    new_rows = [row for row in pending if row['id'] > before_audit_id]
    if not new_rows:
        return None
    dept_names = _department_names_by_id()
    # A single mutation can produce more than one structural audit row
    # (e.g. JobForm flips both is_managerial and department_id in one
    # save) — join them into one toast rather than firing several.
    descriptions = [_describe_pending_change(row, dept_names) for row in new_rows]
    return {'descriptions': descriptions}


def get_org_chart_tree() -> Dict[str, Any]:
    """Rekurencyjne drzewo działów (parent_department_id) + kierownik
    każdego działu (jobs.is_managerial) + zwykli pracownicy pogrupowani pod
    swoim działem + Dyrektor zakładu (jobs.is_director, ponad wszystkimi
    działami najwyższego poziomu).

    Stanowiska bez działu (jobs.department_id IS NULL — task2's Pulpit
    alert, JobRepository.get_orphan_jobs) świadomie nie pojawiają się w tym
    drzewie: wykres organizacyjny jest z definicji kształtem działów, a
    "stanowisko bez działu" nie ma tu naturalnego miejsca — ma już własny
    alert na Pulpicie.
    """
    departments = DepartmentRepository().get_all()
    jobs = JobRepository().get_all()
    active_workers = WorkerRepository().list_active_for_org_chart()

    jobs_by_department: Dict[int, List[Any]] = defaultdict(list)
    director_job: Optional[Any] = None
    for job in jobs:
        if job['is_director']:
            director_job = job
        if job['department_id'] is not None:
            jobs_by_department[job['department_id']].append(job)

    workers_by_job: Dict[str, List[Any]] = defaultdict(list)
    for worker in active_workers:
        if worker['job_id'] is not None:
            workers_by_job[worker['job_id']].append(worker)

    children_by_parent: Dict[Optional[int], List[Any]] = defaultdict(list)
    for dept in departments:
        children_by_parent[dept['parent_department_id']].append(dept)

    def build_department_node(dept: Any) -> Dict[str, Any]:
        dept_jobs = jobs_by_department.get(dept['id'], [])
        manager_job = next((j for j in dept_jobs if j['is_managerial']), None)
        regular_jobs = [j for j in dept_jobs if not j['is_managerial']]

        return {
            'id': dept['id'],
            'name': dept['name'],
            'manager': {
                'job_id': manager_job['id'],
                'job_description': manager_job['description'],
                'workers': [_worker_entry(w) for w in workers_by_job.get(manager_job['id'], [])],
            } if manager_job else None,
            'workers': [
                {**_worker_entry(w), 'job_id': job['id'], 'job_description': job['description']}
                for job in regular_jobs
                for w in workers_by_job.get(job['id'], [])
            ],
            'children': [build_department_node(child) for child in children_by_parent.get(dept['id'], [])],
        }

    return {
        'director': {
            'job_id': director_job['id'],
            'job_description': director_job['description'],
            'workers': [_worker_entry(w) for w in workers_by_job.get(director_job['id'], [])],
        } if director_job else None,
        'departments': [build_department_node(dept) for dept in children_by_parent.get(None, [])],
    }
