"""
services/dashboard_service.py — IMPLEMENTATION_PLAN.md §11.

Rola-świadomy punkt wejścia dla pulpitu (DSH_1-4): decyduje, KTÓRE panele
dana rola widzi, nie JAK pojedynczy panel liczy swoje kubełki (to wciąż
services/alert_service.py, cross-cutting decision #4).
"""
from config.auth_config import own_data_worker_id
import services.alert_service as alert_service
from repositories.trainings.training_repository import TrainingRepository
from repositories.workers.worker_repository import WorkerRepository


def get_summary(user) -> dict:
    """DSH_1 — liczba aktywnych pracowników i szkoleń w bieżącym miesiącu.
    Żadna z tych dwóch liczb nie identyfikuje pojedynczej osoby, więc
    (inaczej niż get_alerts) nie ma tu rozróżnienia own_data — każda rola,
    która w ogóle dotrze do tej funkcji (moduł `dashboard` gate na poziomie
    route'a), widzi te same dwie liczby."""
    return {
        'active_workers': WorkerRepository().count_active(),
        'trainings_this_month': TrainingRepository().count_current_month(),
    }


def get_alerts(user) -> dict:
    """DSH_2/3/4 — panele alertów, zawężone wg roli.

    Pełny dostęp (superadmin/hr_manager, own_data=FALSE na `dashboard`):
    trzy panele pracownicze — medical/bhp/foreigner_docs.

    `trainer` (own_data=TRUE na `dashboard`, RBAC seed Fazy 0): RODO_2 jest
    twardą blokadą na dane identyfikujące pracowników w medical/bhp/
    foreigner_docs, nie zawężeniem do „moich" wierszy w tych panelach —
    więc trainer nie dostaje żadnego z trzech pracowniczych paneli, tylko
    listę własnych szkoleń (ta sama definicja „własne" co TRN_7's
    assert_trainer_can_edit / TrainingRepository.list_for_trainer).

    `viewer`: nigdy tu nie dociera — moduł `dashboard` nie ma dla niego
    wiersza has_access w RBAC seed, więc
    module_permission_required('dashboard') zwraca 403 w route'cie, zanim
    ta funkcja zostanie wywołana."""
    owner_worker_id = own_data_worker_id(user, 'dashboard')
    if owner_worker_id is not None:
        return {'own_trainings': TrainingRepository().list_for_trainer(owner_worker_id)}

    return {
        'medical': alert_service.get_expiring_medical(),
        'bhp': alert_service.get_expiring_bhp(),
        'foreigner_docs': alert_service.get_expiring_foreigner_docs_with_bucket(),
    }
