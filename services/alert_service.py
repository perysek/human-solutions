"""
Współdzielona logika progów/alertów (cross-cutting decision #4,
IMPLEMENTATION_PLAN.md §2). Jedno miejsce, żeby odznaki na liście
pracowników, globalne raporty (Faza 4: MED_6/BHP_5) i dashboard
(Faza 6: DSH_2-4) nigdy nie rozjechały się w definicji „wygasające".

Faza 4 dodała kubełkowanie {critical/warning/notice} dla medical/bhp, z
progami 30/60/90 dni twardo zakodowanymi tutaj. Faza 6 przenosi je do
tabeli `alert_thresholds` (DSH_5, edytowalne przez superadmina) —
`_get_thresholds` czyta stamtąd, z tym samym fallbackiem na moduły stałe
poniżej, gdyby wiersz progu dla modułu nie istniał albo baza była
niedostępna (IMPLEMENTATION_PLAN.md §9). WRK_10 (dokumenty cudzoziemca,
Faza 2) celowo nie ma bucketingu na swoim oryginalnym raporcie — patrz
OQ_1 poniżej; Faza 6 dodaje osobny bucketed wariant tylko dla dashboardu
(DSH_4), patrz `get_expiring_foreigner_docs_with_bucket`.
"""
from datetime import date
from typing import Optional

from repositories.bhp.bhp_training_repository import BhpTrainingRepository
from repositories.dashboard.alert_threshold_repository import AlertThresholdRepository
from repositories.medical.medical_exam_repository import MedicalExamRepository
from repositories.workers.foreigner_data_repository import ForeignerDataRepository
from repositories.workers.worker_termination_repository import WorkerTerminationRepository

# Pulpit's "N dni do zwolnienia" section — pending notices of termination
# (worker_service.submit_termination) whose planned_fire_date is coming up.
# Fixed window, not a configurable alert_thresholds module like medical/
# bhp/foreigner_docs — the product ask was specifically a 14-day section,
# not a tunable threshold.
WORKER_TERMINATION_WINDOW_DAYS = 14
WORKER_TERMINATION_CRITICAL_DAYS = 7

# OQ_1 (IMPLEMENTATION_PLAN.md §15): dokumenty cudzoziemca — 30/60 dni,
# celowo bez trzeciego progu 90-dniowego (inaczej niż medical/bhp).
DEFAULT_FOREIGNER_DOC_THRESHOLD_DAYS = 30

# Hard fallback — used only when alert_thresholds has no row for a module
# yet (mid-migration) or the DB is unreachable. Fazy 0-4 shipped with these
# as the only source of truth; Faza 6 makes them a safety net, not the
# primary path (see _get_thresholds).
CRITICAL_DAYS = 30
WARNING_DAYS = 60
NOTICE_DAYS = 90


def _get_thresholds(module: str) -> dict:
    """DSH_5 — resolve `module`'s ('medical'/'bhp'/'foreigner_docs')
    configured thresholds from `alert_thresholds`, falling back to the
    hard-coded 30/60/90 constants above if the table has no row for it yet
    or the DB is unreachable (mirrors every other repo-backed lookup in
    this codebase's degrade-gracefully convention, e.g. RoleRepository's
    fallback to MODULE_PERMISSIONS)."""
    try:
        row = AlertThresholdRepository().get_by_module(module)
    except Exception:
        row = None
    if not row:
        return {'critical_days': CRITICAL_DAYS, 'warning_days': WARNING_DAYS, 'notice_days': NOTICE_DAYS}
    return {'critical_days': row['critical_days'], 'warning_days': row['warning_days'], 'notice_days': row['notice_days']}


def get_expiring_foreigner_docs(days_threshold: int = DEFAULT_FOREIGNER_DOC_THRESHOLD_DAYS) -> list:
    """WRK_10 — pracownicy, których dokument cudzoziemca wygasa w ciągu
    `days_threshold` dni (lub już wygasł). Używane przez
    routes/workers/routes.py's global report — unbucketed, unchanged by
    Faza 6 (see get_expiring_foreigner_docs_with_bucket for the dashboard's
    bucketed variant)."""
    return ForeignerDataRepository().get_expiring(days_threshold)


def _bucket(valid_until: Optional[date], thresholds: dict) -> str:
    """critical / warning / notice dla jednej daty ważności, wg progów
    `thresholds` ({critical_days, warning_days, notice_days} — Faza 6:
    konfigurowalne per moduł zamiast globalnych stałych). Wywołujący już
    odfiltrował NULL-e (get_expiring pomija valid_until IS NULL), więc None
    tu nie powinno wystąpić — traktowane jako najmniej pilne, żeby nigdy
    nie ukryć wiersza."""
    if valid_until is None:
        return 'notice'
    days_left = (valid_until - date.today()).days
    if days_left <= thresholds['critical_days']:
        return 'critical'
    if days_left <= thresholds['warning_days']:
        return 'warning'
    return 'notice'


def _bucket_2tier(valid_until: Optional[date], thresholds: dict) -> str:
    """DSH_4's foreigner_docs variant of `_bucket`: only critical/warning
    (OQ_1 — this module has no 90-day third tier), so anything past
    warning_days still reads 'warning' rather than a 'notice' tier this
    module doesn't have."""
    if valid_until is None:
        return 'warning'
    days_left = (valid_until - date.today()).days
    return 'critical' if days_left <= thresholds['critical_days'] else 'warning'


def get_expiring_medical(threshold_days: Optional[int] = None) -> list:
    """MED_6 — badania lekarskie wygasające w ciągu `threshold_days` dni
    (lub już wygasłe; brak argumentu = skonfigurowany `notice_days` modułu
    medical, Faza 6), każde z dopisanym kubełkiem critical/warning/notice."""
    thresholds = _get_thresholds('medical')
    days = threshold_days if threshold_days is not None else thresholds['notice_days']
    return [{**row, 'bucket': _bucket(row['valid_until'], thresholds)} for row in MedicalExamRepository().get_expiring(days)]


def get_expiring_bhp(threshold_days: Optional[int] = None) -> list:
    """BHP_5 — analogicznie do get_expiring_medical, dla bhp_trainings."""
    thresholds = _get_thresholds('bhp')
    days = threshold_days if threshold_days is not None else thresholds['notice_days']
    return [{**row, 'bucket': _bucket(row['valid_until'], thresholds)} for row in BhpTrainingRepository().get_expiring(days)]


def get_expiring_foreigner_docs_with_bucket(days_threshold: Optional[int] = None) -> list:
    """DSH_4 — dashboard variant of get_expiring_foreigner_docs: same rows,
    each tagged with a 2-tier bucket (see `_bucket_2tier`). Defaults its
    query window to the configured `warning_days` (not WRK_10's narrower
    30-day report default) so the dashboard panel surfaces everything that
    could plausibly be 'warning' or 'critical'."""
    thresholds = _get_thresholds('foreigner_docs')
    days = days_threshold if days_threshold is not None else thresholds['warning_days']
    rows = get_expiring_foreigner_docs(days)
    return [{**row, 'bucket': _bucket_2tier(row['document_validity'], thresholds)} for row in rows]


def get_upcoming_terminations(days_threshold: int = WORKER_TERMINATION_WINDOW_DAYS) -> list:
    """Pending notices of termination whose planned_fire_date falls within
    `days_threshold` days (or has already been reached — the caller is
    expected to have run worker_service.finalize_due_terminations() first,
    same ordering dashboard_service.get_alerts already uses for the other
    panels). 2-tier bucket like foreigner_docs (no third 'notice' tier —
    a 14-day window is short enough that everything in it is already
    'zbliża się' at worst)."""
    rows = WorkerTerminationRepository().get_upcoming(as_of=date.today(), days=days_threshold)
    return [
        {
            **row,
            'bucket': 'critical' if (row['planned_fire_date'] - date.today()).days <= WORKER_TERMINATION_CRITICAL_DAYS else 'warning',
        }
        for row in rows
    ]
