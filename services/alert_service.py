"""
Współdzielona logika progów/alertów (cross-cutting decision #4,
IMPLEMENTATION_PLAN.md §2). Jedno miejsce, żeby odznaki na liście
pracowników, globalne raporty (Faza 4: MED_6/BHP_5) i dashboard
(Faza 6: DSH_2-4) nigdy nie rozjechały się w definicji „wygasające".

Faza 2 wprowadza tylko WRK_10 (dokumenty cudzoziemca). Fazy 4 i 6 dodadzą
tu odpowiedniki dla badań lekarskich/BHP oraz kubełkowanie
{critical/warning/notice} czytane z tabeli `alert_thresholds` (Faza 6) —
do tego czasu progi są twardo zakodowane, zgodnie z jawnym fallbackiem,
o którym mówi IMPLEMENTATION_PLAN.md §9 dla analogicznego przypadku
medical/bhp.
"""
from repositories.workers.foreigner_data_repository import ForeignerDataRepository

# OQ_1 (IMPLEMENTATION_PLAN.md §15): dokumenty cudzoziemca — 30/60 dni,
# celowo bez trzeciego progu 90-dniowego (inaczej niż medical/bhp).
DEFAULT_FOREIGNER_DOC_THRESHOLD_DAYS = 30


def get_expiring_foreigner_docs(days_threshold: int = DEFAULT_FOREIGNER_DOC_THRESHOLD_DAYS) -> list:
    """WRK_10 — pracownicy, których dokument cudzoziemca wygasa w ciągu
    `days_threshold` dni (lub już wygasł). Używane przez
    routes/workers/routes.py i (Faza 6) dashboard."""
    return ForeignerDataRepository().get_expiring(days_threshold)
