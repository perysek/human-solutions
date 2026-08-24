"""services/training_presence_service.py — MOBILE_PRESENCE_CONFIRMATION_PLAN.md §4.3.

Walidacja domenowa listy obecności (public sign-in links + potwierdzenia
pracowników), tej samej rangi co training_service.py, ale celowo osobny
moduł: training_service.py obsługuje uwierzytelnioną stronę (HR/Trainer),
ten plik obsługuje ZARÓWNO stronę admina (generuj/unieważnij link — wywoływane
z routes/trainings/routes.py, z current_user) JAK I stronę publiczną, bez
current_user (routes/public/routes.py) — stąd żadna funkcja tutaj nie
importuje flask.request/current_user; ip/user-agent trafiają jako zwykłe
argumenty, wyciągnięte przez routing layer, tak jak `payload`/`user` w
training_service.py.
"""
from datetime import date, datetime
from typing import Optional

from config.database import managed_transaction
from exceptions import ConflictError, GoneError, NotFoundError, ValidationError
from repositories.trainings.training_repository import TrainingRepository
from repositories.trainings.training_participant_repository import TrainingParticipantRepository
from repositories.trainings.training_sign_in_repository import TrainingSignInRepository
from repositories.trainings.training_presence_repository import TrainingPresenceRepository
import services.training_service as training_service

DEFAULT_TTL_HOURS = 12


def _is_eligible_for_sign_in(participant, before: date, confirmed_ids: set) -> bool:
    """Shared eligibility rule for the whole feature — a participant may be
    offered/accept a presence confirmation only if their session already
    happened (start_date AND finish_date set, both strictly before `before`
    — a same-day training doesn't qualify on the day it runs, only from the
    next day on) and they haven't confirmed yet. `before` is always a fixed
    reference date, never "today at read time": the generation-time gate
    (generate_sign_in_link) uses today (the token doesn't exist yet), while
    the public roster/confirm (get_sign_in_roster/confirm_presence) use the
    token's own `created_at` date, so a participant's eligibility for a
    given QR can't silently flip after the fact as calendar days pass."""
    return (
        participant['start_date'] is not None
        and participant['finish_date'] is not None
        and participant['start_date'] < before
        and participant['finish_date'] < before
        and participant['id'] not in confirmed_ids
    )


def _load_valid_token(token: str):
    """Wspólna walidacja dla obu publicznych endpointów (GET roster, POST
    confirm) — 404 dla nieznanego tokenu (nic nie zdradza o jego istnieniu),
    410 dla unieważnionego/wygasłego (token istniał, już nie jest ważny)."""
    row = TrainingSignInRepository().get_by_token(token)
    if not row:
        raise NotFoundError('Link jest nieprawidłowy')
    if row['revoked_at'] is not None:
        raise GoneError('Ten link został unieważniony')
    if row['expires_at'] <= datetime.utcnow():
        raise GoneError('Ten link wygasł')
    return row


# ─── Admin side (HR/Trainer, current_user, called from routes/trainings) ───

def generate_sign_in_link(training_id: int, user, ttl_hours: int = DEFAULT_TTL_HOURS) -> dict:
    """Unieważnia dowolny aktywny token dla tego szkolenia i tworzy nowy —
    'regeneruj' to zawsze nowy wiersz, nigdy UPDATE starego tokenu (§3's
    "no UPDATE beyond revoke"). Ta sama brama własności co
    register_participant/update_participant (TRN_7/8/9)."""
    training = TrainingRepository().get_by_id(training_id)
    if not training:
        raise NotFoundError('Szkolenie nie znalezione')
    training_service.assert_trainer_can_edit(training_id, user)

    participants = TrainingParticipantRepository().get_by_training(training_id)
    confirmed_ids = {c['training_participant_id'] for c in TrainingPresenceRepository().get_by_training(training_id)}
    today = date.today()
    if not any(_is_eligible_for_sign_in(p, today, confirmed_ids) for p in participants):
        raise ValidationError(
            'Brak uczestników kwalifikujących się do potwierdzenia obecności — wymagane są ustawione daty '
            'rozpoczęcia i zakończenia (wcześniejsze niż dzisiaj) oraz brak wcześniejszego potwierdzenia '
            'przynajmniej dla jednego uczestnika.'
        )

    user_id = getattr(user, 'id', None)
    with managed_transaction():
        TrainingSignInRepository().revoke_active(training_id)
        new_id, token = TrainingSignInRepository().create(training_id, user_id, ttl_hours)
    row = TrainingSignInRepository().get_by_token(token)
    return {'id': new_id, 'token': token, 'expires_at': row['expires_at']}


def get_sign_in_status(training_id: int, user) -> Optional[dict]:
    if not TrainingRepository().get_by_id(training_id):
        raise NotFoundError('Szkolenie nie znalezione')
    training_service.assert_trainer_can_edit(training_id, user)

    active = TrainingSignInRepository().get_active_by_training(training_id)
    total = len(TrainingParticipantRepository().get_by_training(training_id))
    confirmed = len(TrainingPresenceRepository().get_by_training(training_id))
    return {
        'active_token': active,  # None if no active link
        'confirmed': confirmed,
        'total': total,
    }


def revoke_sign_in_link(training_id: int, user) -> None:
    if not TrainingRepository().get_by_id(training_id):
        raise NotFoundError('Szkolenie nie znalezione')
    training_service.assert_trainer_can_edit(training_id, user)
    TrainingSignInRepository().revoke_active(training_id)


# ─── Public side (no current_user — the token IS the auth) ─────────────────

def get_sign_in_roster(token: str) -> dict:
    """GET /public/sign-in/<token> — TRN roster scoped to this one token's
    training only. `display_name` mirrors what a printed sheet already shows
    everyone in the room (MOBILE_PRESENCE_CONFIRMATION_PLAN.md §7's PII
    minimization note) — no other worker field is exposed here."""
    token_row = _load_valid_token(token)
    training = TrainingRepository().get_by_id(token_row['training_id'])
    if not training:
        # FK CASCADE means the token dies with the training, so this
        # shouldn't happen in practice — defensive check anyway.
        raise NotFoundError('Szkolenie nie znalezione')

    participants = TrainingParticipantRepository().get_by_training(token_row['training_id'])
    confirmed_ids = {
        c['training_participant_id'] for c in TrainingPresenceRepository().get_by_training(token_row['training_id'])
    }
    generated_on = token_row['created_at'].date()
    return {
        'training': {
            'description': training['description'],
            'training_date': training['training_date'].isoformat() if training['training_date'] else None,
        },
        # Only participants eligible for *this* token (see
        # _is_eligible_for_sign_in) are offered — someone already confirmed,
        # not yet started/finished, or whose session runs the same day this
        # QR was generated simply isn't in the list. No `confirmed` field
        # needed here anymore: every row returned is, by construction, not
        # yet confirmed.
        'participants': [
            {
                'id': p['id'],
                'display_name': f"{p['worker_firstname']} {p['worker_surname']}",
            }
            for p in participants
            if _is_eligible_for_sign_in(p, generated_on, confirmed_ids)
        ],
    }


def confirm_presence(
    token: str, payload: dict, *, ip_address: Optional[str], user_agent: Optional[str],
) -> int:
    """POST /public/sign-in/<token>/confirm. `employee_id` is the
    buddy-punch second factor (§1 step 4/§7) — must match the real
    worker_id behind the selected participant row, not just any known id."""
    token_row = _load_valid_token(token)

    participant_id = payload.get('participant_id')
    if not participant_id:
        raise ValidationError('Nie wybrano uczestnika')
    participant = TrainingParticipantRepository().get_by_id(participant_id)
    if not participant or participant['training_id'] != token_row['training_id']:
        raise NotFoundError('Uczestnik nie znaleziony dla tego szkolenia')

    # Re-validated server-side, not trusted from the roster the client
    # already fetched — state can drift between GET and POST (admin edits
    # the participant's dates, someone else confirms first). Same
    # eligibility rule get_sign_in_roster used to decide whether this row
    # was ever offered in the first place.
    confirmed_ids = {
        c['training_participant_id']
        for c in TrainingPresenceRepository().get_by_training(token_row['training_id'])
    }
    if not _is_eligible_for_sign_in(participant, token_row['created_at'].date(), confirmed_ids):
        raise ValidationError('Ten uczestnik nie kwalifikuje się już do potwierdzenia obecności')

    employee_id = (payload.get('employee_id') or '').strip()
    if not employee_id or employee_id != participant['worker_id']:
        raise ValidationError('Numer pracownika nie zgadza się z wybraną osobą')

    signature_name = (payload.get('signature_name') or '').strip()
    if not signature_name:
        raise ValidationError('Podpis (imię i nazwisko) jest wymagany')
    if not payload.get('consent_ack'):
        raise ValidationError('Potwierdzenie obecności jest wymagane')

    if TrainingPresenceRepository().get_by_participant(participant_id):
        raise ConflictError('Obecność już została potwierdzona')

    signature_svg = payload.get('signature_svg') or None

    with managed_transaction():
        new_id = TrainingPresenceRepository().create(
            participant_id, token_row['id'], signature_name, signature_svg, ip_address, user_agent,
        )
    return new_id
