"""Repository dla tokenów listy obecności (training_sign_in_tokens) —
MOBILE_PRESENCE_CONFIRMATION_PLAN.md §3/§4.1.

Jeden aktywny token na szkolenie w danym momencie: `create()` nie sam w sobie
unieważnia poprzedniego — to obowiązek wywołującego (services.training_presence_service),
tak samo jak TrainingParticipantRepository.create nie sprawdza duplikatów
samodzielnie (robi to warstwa serwisu, `exists_active`). Token jest
odczytywany przez publiczny, niezalogowany endpoint (routes/public/routes.py)
— stąd `get_by_token` nie filtruje po `expires_at`/`revoked_at`: ważność
tokenu to reguła biznesowa (services.training_presence_service._load_valid_token),
nie coś co repository powinno milcząco ukrywać jako "nie znaleziono".
"""
import secrets
from datetime import datetime, timedelta
from typing import Any, Optional

from repositories.auditable import AuditableMixin
from repositories.base_repository import BaseRepository

_SELECT = """
    SELECT id, training_id, token, created_by_user_id, created_at, expires_at, revoked_at
    FROM training_sign_in_tokens
"""


class TrainingSignInRepository(AuditableMixin, BaseRepository):
    # Audytowane pod encją 'training' (nie 'training_sign_in_token') — sama
    # konwencja co TrainingParticipantRepository (patrz jej docstring):
    # zmiana listy obecności pojawia się w śladzie audytowym *szkolenia*.
    audit_entity_type = 'training'

    def __init__(self):
        super().__init__('training_sign_in_tokens')

    def get_active_by_training(self, training_id: int) -> Optional[Any]:
        """Panel admina (TrainingViewPage) — aktualny, jeszcze ważny link, jeśli istnieje."""
        return self._fetch_one(
            _SELECT + " WHERE training_id = %s AND revoked_at IS NULL AND expires_at > NOW() "
            "ORDER BY created_at DESC LIMIT 1",
            (training_id,),
        )

    def get_by_token(self, token: str) -> Optional[Any]:
        """Surowy lookup — walidację ważności robi services.training_presence_service."""
        return self._fetch_one(_SELECT + " WHERE token = %s", (token,))

    def revoke_active(self, training_id: int) -> bool:
        cursor = self._execute(
            "UPDATE training_sign_in_tokens SET revoked_at = CURRENT_TIMESTAMP "
            "WHERE training_id = %s AND revoked_at IS NULL",
            (training_id,),
        )
        return cursor.rowcount > 0

    def create(self, training_id: int, created_by_user_id: Optional[int], ttl_hours: int = 12) -> tuple:
        """Zwraca (id, token) — token jest zwracany tylko raz, tutaj, tak samo
        jak reset_token w routes/auth/routes.py (nie jest ponownie
        odczytywany z bazy w plaintext gdziekolwiek indziej poza get_by_token)."""
        token = secrets.token_urlsafe(32)
        expires_at = datetime.utcnow() + timedelta(hours=ttl_hours)
        new_id = self._execute_insert(
            "INSERT INTO training_sign_in_tokens (training_id, token, created_by_user_id, expires_at) "
            "VALUES (%s, %s, %s, %s)",
            (training_id, token, created_by_user_id, expires_at),
        )
        self._audit('CREATE', training_id, label='sign-in-link')
        return new_id, token
