"""
Złożenie drzewa organizacyjnego + tłumaczenie trigger_source na etykiety PL —
ORG_CHART_PROPOSAL.md §3b/§3e.

Read-only assembly across DepartmentRepository/JobRepository/WorkerRepository
— żadna z tych tabel nie jest właścicielem "wykresu organizacyjnego", więc ta
logika nie jest przypięta do jednego z tych repository (to samo rozumowanie
co dashboard_service.py's własne podsumowanie wielo-repozytoryjne).

Drzewo jest w całości WYLICZANE przy odczycie, nigdy nie przechowywane — patrz
migracji 8f053c175547 docstring, dlaczego ta zasada tu obowiązuje.
"""
from collections import defaultdict
from typing import Any, Dict, List, Optional

from repositories.departments.department_repository import DepartmentRepository
from repositories.jobs.job_repository import JobRepository
from repositories.org_chart.org_chart_revision_repository import OrgChartRevisionRepository
from repositories.workers.worker_repository import WorkerRepository

# trigger_source (org_chart_revisions, migracja 0811375b3298) jest napisem
# przeznaczonym do debugowania, nie do pokazania użytkownikowi wprost —
# _humanize_trigger_source tłumaczy go na polski, zanim trafi do frontendu.
# Każda wartość już z wielkiej litery — łączenie kilku (jobs UPDATE z kilkoma
# zmienionymi polami naraz) nie wymaga dodatkowej transformacji wielkości liter.
_FIELD_LABELS = {
    'is_managerial': 'Zmiana kierownika działu',
    'is_director': 'Zmiana Dyrektora zakładu',
    'department_id': 'Przeniesienie stanowiska do innego działu',
    'parent_department_id': 'Zmiana struktury działów',
}


def _humanize_trigger_source(trigger_source: str) -> str:
    """'departments:5:INSERT' -> 'Dodano dział (ID 5)'
    'jobs:BRYGADZISTA:DELETE' -> 'Usunięto stanowisko kierownicze (BRYGADZISTA)'
    'jobs:BRYGADZISTA:UPDATE:is_managerial;' -> 'Zmiana kierownika działu (BRYGADZISTA)'

    Never raises on an unexpected shape — degrades to the raw string so a
    future trigger change can't 500 the revisions list, only look less
    pretty until this parser catches up."""
    parts = (trigger_source or '').split(':')
    if len(parts) < 3:
        return trigger_source

    table, row_id, op = parts[0], parts[1], parts[2]
    detail = parts[3] if len(parts) > 3 else ''

    if table == 'departments':
        if op == 'INSERT':
            return f'Dodano dział (ID {row_id})'
        if op == 'DELETE':
            return f'Usunięto dział (ID {row_id})'
        return f'{_FIELD_LABELS["parent_department_id"]} (dział ID {row_id})'

    if table == 'jobs':
        if op == 'INSERT':
            return f'Dodano stanowisko ({row_id})'
        if op == 'DELETE':
            return f'Usunięto stanowisko kierownicze ({row_id})'
        fields = [f for f in detail.split(';') if f]
        labels = [_FIELD_LABELS.get(f, f) for f in fields]
        if not labels:
            return f'Zmiana stanowiska ({row_id})'
        return f'{", ".join(labels)} ({row_id})'

    return trigger_source


def humanize_revision(row: Any) -> Dict[str, Any]:
    """{id, revised_at, label} — the shape routes/org_chart/routes.py hands
    the frontend for one org_chart_revisions row, whether that's the single
    'latest' badge or one row of the paginated history table."""
    return {
        'id': row['id'],
        'revised_at': row['revised_at'].isoformat() if row.get('revised_at') else None,
        'label': _humanize_trigger_source(row['trigger_source']),
    }


def _worker_entry(worker: Any) -> Dict[str, Any]:
    return {'id': worker['id'], 'full_name': f"{worker['firstname']} {worker['surname']}"}


def capture_revision_delta(before_id: Optional[int]) -> Optional[Dict[str, Any]]:
    """TASK3 (toast after every org-structure DB update) — compare
    `before_id` (an OrgChartRevisionRepository.get_latest_id() snapshot the
    caller takes immediately BEFORE its own mutation) against the latest
    revision now. Returns the humanized new revision (humanize_revision) if
    the DB trigger recorded a structural change during that mutation, or
    None if org_chart_revisions didn't move — e.g. a job's description-only
    edit, or a job-position INSERT (deliberately excluded, see migration
    0811375b3298's docstring).

    Deliberately re-derives "did it change" from the trigger's own output
    (the single source of truth for what counts as a structural change)
    rather than re-implementing that judgment in Python from the
    before/after field values — the same reasoning the migration itself
    gives for using a DB trigger over a repository-side call in the first
    place: one place decides, everything else just reads the result.
    """
    latest = OrgChartRevisionRepository().get_latest()
    if not latest:
        return None
    if before_id is not None and latest['id'] <= before_id:
        return None
    return humanize_revision(latest)


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
