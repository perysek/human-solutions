"""
Współdzielona logika progów/alertów (cross-cutting decision #4,
IMPLEMENTATION_PLAN.md §2). Jedno miejsce, żeby odznaki na liście
pracowników, globalne raporty (Faza 4: MED_6/BHP_5) i dashboard
(Faza 6: DSH_2-4) nigdy nie rozjechały się w definicji „wygasające".

Faza 4 dodaje kubełkowanie {critical/warning/notice} dla medical/bhp, z
progami 30/60/90 dni twardo zakodowanymi tutaj — Faza 6 przeniesie je do
tabeli `alert_thresholds`, z tym samym fallbackiem na wypadek braku wiersza
progu dla modułu (IMPLEMENTATION_PLAN.md §9). WRK_10 (dokumenty
cudzoziemca, Faza 2) celowo nie ma bucketingu — patrz OQ_1 poniżej.
"""
from datetime import date
from typing import Optional

from repositories.bhp.bhp_training_repository import BhpTrainingRepository
from repositories.medical.medical_exam_repository import MedicalExamRepository
from repositories.workers.foreigner_data_repository import ForeignerDataRepository

# OQ_1 (IMPLEMENTATION_PLAN.md §15): dokumenty cudzoziemca — 30/60 dni,
# celowo bez trzeciego progu 90-dniowego (inaczej niż medical/bhp).
DEFAULT_FOREIGNER_DOC_THRESHOLD_DAYS = 30

# Kubełki dla medical/bhp (MED_6/BHP_5, DSH_2-3) — twardy fallback do
# czasu Fazy 6's alert_thresholds.
CRITICAL_DAYS = 30
WARNING_DAYS = 60
NOTICE_DAYS = 90


def get_expiring_foreigner_docs(days_threshold: int = DEFAULT_FOREIGNER_DOC_THRESHOLD_DAYS) -> list:
    """WRK_10 — pracownicy, których dokument cudzoziemca wygasa w ciągu
    `days_threshold` dni (lub już wygasł). Używane przez
    routes/workers/routes.py i (Faza 6) dashboard."""
    return ForeignerDataRepository().get_expiring(days_threshold)


def _bucket(valid_until: Optional[date]) -> str:
    """critical (≤30d) / warning (≤60d) / notice (≤90d) dla jednej daty
    ważności. Wywołujący już odfiltrował NULL-e (get_expiring pomija
    valid_until IS NULL), więc None tu nie powinno wystąpić — traktowane
    jako najmniej pilne, żeby nigdy nie ukryć wiersza."""
    if valid_until is None:
        return 'notice'
    days_left = (valid_until - date.today()).days
    if days_left <= CRITICAL_DAYS:
        return 'critical'
    if days_left <= WARNING_DAYS:
        return 'warning'
    return 'notice'


def get_expiring_medical(threshold_days: int = NOTICE_DAYS) -> list:
    """MED_6 — badania lekarskie wygasające w ciągu `threshold_days` dni
    (lub już wygasłe), każde z dopisanym kubełkiem critical/warning/notice."""
    return [{**row, 'bucket': _bucket(row['valid_until'])} for row in MedicalExamRepository().get_expiring(threshold_days)]


def get_expiring_bhp(threshold_days: int = NOTICE_DAYS) -> list:
    """BHP_5 — analogicznie do get_expiring_medical, dla bhp_trainings."""
    return [{**row, 'bucket': _bucket(row['valid_until'])} for row in BhpTrainingRepository().get_expiring(threshold_days)]
