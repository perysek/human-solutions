"""
Walidacja przypisania działu nadrzędnego (parent_department_id) —
ORG_CHART_PROPOSAL.md §3a.

Wydzielone z routes/departments/routes.py do własnego pliku service, mimo że
`departments`/`jobs` nie mają dziś dedykowanego `services/*` (walidacja
mieszka inline w routes.py lub w repository) — cykl-check jest realną, nową
złożonością (dwa zapytania do bazy, jasna reguła biznesowa "dział nie może
być swoim przodkiem"), a nie jednolinijkową poprawką, więc zasługuje na
własne miejsce zamiast dalej rozrastać routes.py.
"""
from typing import Optional

from exceptions import ConflictError, NotFoundError, ValidationError
from repositories.departments.department_repository import DepartmentRepository


def validate_parent_assignment(
    repo: DepartmentRepository, department_id: Optional[int], parent_department_id: Optional[int],
) -> None:
    """Sprawdź, czy `parent_department_id` jest poprawnym działem nadrzędnym
    przed zapisem.

    `department_id` to edytowany dział (None przy tworzeniu — świeży,
    jeszcze nieistniejący dział nie może być niczyim przodkiem, więc cykl
    jest wtedy niemożliwy z definicji i sprawdzana jest tylko istnienie
    rodzica).

    Raises:
        NotFoundError: parent_department_id wskazuje na nieistniejący dział
            (inaczej surowy IntegrityError z FK zamiast czytelnego błędu).
        ConflictError: przypisanie utworzyłoby cykl (dział jako własny
            przodek) — surfaced jako 409, żeby frontend mógł to odróżnić od
            zwykłego błędu walidacji pola.
    """
    if parent_department_id is None:
        return

    if not repo.get_by_id(parent_department_id):
        raise NotFoundError('Wybrany dział nadrzędny nie istnieje')

    if department_id is not None and repo.would_create_cycle(department_id, parent_department_id):
        raise ConflictError(
            'Nie można ustawić tego działu jako nadrzędnego — utworzyłoby to cykl '
            '(dział stałby się swoim własnym przodkiem).'
        )


def parse_parent_department_id(data: dict) -> Optional[int]:
    """department_id-shaped int-or-null field, same convention as
    routes/jobs/routes.py's _parse_department_id — the only shapes
    DepartmentForm's parent-picker <Select> value can produce."""
    raw = data.get('parent_department_id')
    if raw in (None, ''):
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        raise ValidationError('Nieprawidłowy identyfikator działu nadrzędnego')
