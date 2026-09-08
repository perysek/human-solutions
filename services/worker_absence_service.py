"""services/worker_absence_service.py

Orchestrates the absence request/approval lifecycle and manual (HR-entered)
absence records. Ported from the golden standard's AbsenceService
(faktura_scanner_flask branch invoices-app) — the appointment-conflict
checking there is dropped (no client scheduling in this domain); everything
else (submission validation, balance-limit gating, approval/rejection,
cancel flows, manual entry, hard-delete guards) carries over almost
verbatim, adapted to this repo's function-based service / exceptions.py
error hierarchy convention (see services/worker_service.py).
"""
from datetime import datetime, date, time
from typing import List, Optional

from config.database import managed_transaction
from exceptions import NotFoundError, ValidationError
from repositories.absences.absence_approver_repository import WorkerAbsenceApproverRepository
from repositories.absences.absence_category_repository import WorkerAbsenceCategoryRepository
from repositories.absences.absence_repository import WorkerAbsenceRepository
import services.worker_absence_balance_service as balance_service


def _repo() -> WorkerAbsenceRepository:
    return WorkerAbsenceRepository()


def _category_repo() -> WorkerAbsenceCategoryRepository:
    return WorkerAbsenceCategoryRepository()


def _approver_repo() -> WorkerAbsenceApproverRepository:
    return WorkerAbsenceApproverRepository()


def _compute_proposed_value(full_day: bool, date_from: date, date_to: date,
                             time_from: Optional[time], time_to: Optional[time]) -> float:
    """Proposed whole days (full_day) or hours (time-slot)."""
    if full_day:
        return float((date_to - date_from).days + 1)
    if time_from and time_to:
        secs = (datetime.combine(date_from, time_to) - datetime.combine(date_from, time_from)).seconds
        return secs / 3600.0
    return 0.0


def _get_pending_or_raise(absence_id: int, approver_worker_id: Optional[str]):
    row = _repo().get_by_id(absence_id)
    if not row:
        raise NotFoundError('Wniosek nie istnieje')
    if row['status'] != 'pending':
        raise ValidationError(f"Wniosek ma status '{row['status']}' — nie można go zatwierdzić/odrzucić")
    if approver_worker_id is not None and row['approver_worker_id'] != approver_worker_id:
        raise ValidationError('Nie jesteś wskazanym przełożonym dla tego wniosku')
    return row


# ── submission ────────────────────────────────────────────────────────────────

def submit_request(
    *, worker_id: str, category_id: int, date_from: date, date_to: date,
    time_from: Optional[time], time_to: Optional[time], approver_worker_id: str,
    notes: Optional[str] = None, created_by: Optional[int] = None,
) -> int:
    """Submit an absence request. Validates the category, the chosen approver,
    time/date field consistency, balance limits, and absence-vs-absence overlap.
    Creates a status='pending' record. Raises ValidationError on any violation."""
    cat_row = _category_repo().get_by_id(category_id)
    if not cat_row or cat_row['is_deleted']:
        raise ValidationError('Nieprawidłowa kategoria nieobecności')

    full_day = bool(cat_row['absence_full_day'])
    if full_day:
        if time_from is not None or time_to is not None:
            raise ValidationError('Kategoria całodniowa — pola godzinowe muszą być puste')
        if date_to < date_from:
            raise ValidationError('Data zakończenia nie może być wcześniejsza niż data rozpoczęcia')
    else:
        if time_from is None or time_to is None:
            raise ValidationError('Kategoria slotowa — wymagane pola time_from i time_to')
        if time_to <= time_from:
            raise ValidationError('Godzina zakończenia musi być późniejsza niż godzina rozpoczęcia')
        date_to = date_from

    if bool(cat_row['is_tracked']):
        proposed = _compute_proposed_value(full_day, date_from, date_to, time_from, time_to)
        check = balance_service.check_before_submit(worker_id, category_id, proposed, source='request')
        if check['blocked']:
            raise ValidationError(f"Przekroczono limit nieobecności: {check['message']} Skontaktuj się z przełożonym.")

    approvers = _approver_repo().list_approvers_for(worker_id)
    approver_ids = {row['approver_worker_id'] for row in approvers}
    if approver_worker_id not in approver_ids:
        raise ValidationError('Wybrany przełożony nie jest przypisany do tego pracownika')

    conflicts = _repo().check_absence_conflicts(worker_id, date_from, date_to, time_from, time_to)
    if conflicts:
        raise ValidationError(
            f"Wniosek koliduje z istniejącą nieobecnością: {conflicts[0]['category_name']} ({conflicts[0]['date_from']})"
        )

    return _repo().create(
        worker_id=worker_id, category_id=category_id, date_from=date_from, date_to=date_to,
        time_from=time_from, time_to=time_to, approver_worker_id=approver_worker_id,
        status='pending', notes=notes, source='request', created_by=created_by,
    )


# ── approval flow ───────────────────────────────────────────────────────────────

def approve(absence_id: int, approver_worker_id: Optional[str]) -> None:
    _get_pending_or_raise(absence_id, approver_worker_id)
    if not _repo().respond(absence_id, 'approved', approver_worker_id):
        raise ValidationError('Nie udało się zatwierdzić wniosku')


def reject(absence_id: int, approver_worker_id: Optional[str], rejection_reason: str) -> None:
    if not rejection_reason or not rejection_reason.strip():
        raise ValidationError('Powód odrzucenia jest wymagany')
    row = _get_pending_or_raise(absence_id, approver_worker_id)
    _repo().respond(absence_id, 'rejected', approver_worker_id or row['approver_worker_id'],
                     rejection_reason=rejection_reason.strip())


def cancel_own(absence_id: int, worker_id: str) -> None:
    """Cancel own request — only while status='pending'."""
    row = _repo().get_by_id(absence_id)
    if not row:
        raise NotFoundError('Wniosek nie istnieje')
    if row['worker_id'] != worker_id:
        raise ValidationError('Brak uprawnień do anulowania tego wniosku')
    if row['status'] != 'pending':
        raise ValidationError('Można anulować tylko wnioski oczekujące na zatwierdzenie')
    _repo().cancel(absence_id)


def cancel_approved(absence_id: int) -> None:
    """Cancel an already-approved absence (management action)."""
    row = _repo().get_by_id(absence_id)
    if not row:
        raise NotFoundError('Nieobecność nie istnieje')
    if row['status'] != 'approved':
        raise ValidationError('Można anulować tylko zatwierdzone nieobecności')
    if not _repo().cancel_approved(absence_id):
        raise ValidationError('Nie udało się anulować nieobecności')


def cancel_own_approved(absence_id: int, worker_id: str) -> None:
    """Worker cancels their OWN already-approved absence."""
    row = _repo().get_by_id(absence_id)
    if not row:
        raise NotFoundError('Nieobecność nie istnieje')
    if row['worker_id'] != worker_id:
        raise ValidationError('Brak uprawnień do anulowania tej nieobecności')
    if row['status'] != 'approved':
        raise ValidationError('Można anulować tylko zatwierdzone nieobecności')
    if not _repo().cancel_approved(absence_id):
        raise ValidationError('Nie udało się anulować nieobecności')


# ── manual creation (HR / approver) ──────────────────────────────────────────────

def create_manual(
    *, worker_id: str, category_id: int, date_from: date, date_to: date,
    time_from: Optional[time], time_to: Optional[time], notes: Optional[str],
    creator_worker_id: Optional[str], created_by: Optional[int] = None,
) -> dict:
    """Auto-approved manual entry (e.g. L4). Returns {'absence_id', 'balance_warning'}
    — a balance overage here is a warning, never a block (HR is knowingly recording it)."""
    cat_row = _category_repo().get_by_id(category_id)
    if not cat_row or cat_row['is_deleted']:
        raise ValidationError('Nieprawidłowa kategoria nieobecności')

    full_day = bool(cat_row['absence_full_day'])
    if not full_day:
        if time_from is None or time_to is None:
            raise ValidationError('Kategoria slotowa wymaga pól godzinowych')
        if time_to <= time_from:
            raise ValidationError('Godzina zakończenia musi być późniejsza niż rozpoczęcia')
        date_to = date_from
    else:
        time_from = None
        time_to = None

    balance_warning = None
    if bool(cat_row['is_tracked']):
        proposed = _compute_proposed_value(full_day, date_from, date_to, time_from, time_to)
        check = balance_service.check_before_submit(worker_id, category_id, proposed, source='manual')
        if check.get('warning'):
            balance_warning = check

    now = datetime.now()
    absence_id = _repo().create(
        worker_id=worker_id, category_id=category_id, date_from=date_from, date_to=date_to,
        time_from=time_from, time_to=time_to, approver_worker_id=creator_worker_id,
        status='approved', notes=notes, source='manual', created_by=created_by,
    )
    return {'absence_id': absence_id, 'balance_warning': balance_warning}


def update_manual(
    absence_id: int, *, category_id: int, date_from: date, date_to: date,
    time_from: Optional[time], time_to: Optional[time], notes: Optional[str],
) -> None:
    row = _repo().get_by_id(absence_id)
    if not row:
        raise NotFoundError('Nieobecność nie istnieje')
    if row['source'] != 'manual':
        raise ValidationError('Można edytować tylko ręcznie dodane nieobecności')

    cat_row = _category_repo().get_by_id(category_id)
    if not cat_row or cat_row['is_deleted']:
        raise ValidationError('Nieprawidłowa kategoria nieobecności')

    full_day = bool(cat_row['absence_full_day'])
    if not full_day:
        if time_from is None or time_to is None:
            raise ValidationError('Kategoria slotowa wymaga pól godzinowych')
        if time_to <= time_from:
            raise ValidationError('Godzina zakończenia musi być późniejsza niż rozpoczęcia')
        date_to = date_from
    else:
        time_from = None
        time_to = None

    _repo().update_manual(
        absence_id, category_id=category_id, date_from=date_from, date_to=date_to,
        time_from=time_from, time_to=time_to, notes=notes,
    )


def soft_delete(absence_id: int) -> None:
    if not _repo().soft_delete(absence_id):
        raise ValidationError('Nieobecność nie istnieje lub już usunięta')


def hard_delete(absence_id: int) -> dict:
    """Superuser cleanup — permanently removes the row regardless of status."""
    row = _repo().get_by_id(absence_id)
    if not row:
        raise NotFoundError('Nieobecność nie istnieje')
    prior_status = row['status']
    with managed_transaction():
        if not _repo().hard_delete(absence_id):
            raise ValidationError('Nie udało się usunąć nieobecności')
    return {'status': prior_status, 'slots_freed': prior_status == 'approved'}


def hard_delete_category(category_id: int) -> None:
    """Purge a soft-deleted category, once nothing references it."""
    cat = _category_repo().get_by_id(category_id)
    if not cat:
        raise NotFoundError('Kategoria nie istnieje')
    if not bool(cat['is_deleted']):
        raise ValidationError(
            'Najpierw usuń kategorię (soft delete) — trwale usuwać można tylko kategorie już oznaczone jako usunięte'
        )
    ref_count = _category_repo().count_absence_references(category_id)
    if ref_count > 0:
        raise ValidationError(
            f'Nie można trwale usunąć kategorii — jest powiązana z {ref_count} nieobecnościami. '
            f'Te dane muszą pozostać nienaruszone.'
        )
    with managed_transaction():
        if not _category_repo().hard_delete(category_id):
            raise ValidationError('Nie udało się usunąć kategorii')


# ── list helpers ──────────────────────────────────────────────────────────────

def list_for_worker(worker_id: str, status_in: Optional[List[str]] = None) -> List[dict]:
    return [dict(r) for r in _repo().list_for_worker(worker_id, status_in)]


def list_for_approver(approver_worker_id: str, status_in: Optional[List[str]] = None) -> List[dict]:
    return [dict(r) for r in _repo().list_for_approver(approver_worker_id, status_in)]


def count_pending_for_approver(approver_worker_id: str) -> int:
    return _repo().count_pending_for_approver(approver_worker_id)


def list_all(**filters) -> List[dict]:
    return [dict(r) for r in _repo().list_all(**filters)]


def preview_conflicts(worker_id: str, date_from: date, date_to: date,
                       time_from: Optional[time] = None, time_to: Optional[time] = None) -> List[dict]:
    """Non-blocking preview of overlapping absences for a proposed range,
    used before submission."""
    return [dict(r) for r in _repo().check_absence_conflicts(worker_id, date_from, date_to, time_from, time_to)]
