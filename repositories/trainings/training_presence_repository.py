"""Repository dla potwierdzeń obecności (training_presence_confirmations) —
MOBILE_PRESENCE_CONFIRMATION_PLAN.md §3/§4.2.

Immutable od strony publicznej: ten plik celowo nie ma `update`/`delete` —
jedyny sposób na zmianę stanu obecności to autoryzowana, audytowana ścieżka
training_service.update_participant. `create()` polega na
UniqueConstraint('training_participant_id') jako ostatecznym backstopie
przeciw duplikatowi (wyścig dwóch równoczesnych requestów przechodzących
pre-check w services.training_presence_service.confirm_presence) — tak samo
jak idx_training_participants_training_worker_active dla uczestników
(migracja a7b8c9d0e1f2).
"""
from typing import Any, List, Optional

from repositories.auditable import AuditableMixin
from repositories.base_repository import BaseRepository


class TrainingPresenceRepository(AuditableMixin, BaseRepository):
    audit_entity_type = 'training'

    def __init__(self):
        super().__init__('training_presence_confirmations')

    def get_by_participant(self, participant_id: int) -> Optional[Any]:
        return self._fetch_one(
            "SELECT * FROM training_presence_confirmations WHERE training_participant_id = %s",
            (participant_id,),
        )

    def get_by_training(self, training_id: int) -> List[Any]:
        """Zbiór potwierdzeń dla całego szkolenia — źródło znaczników ✓ w
        ParticipantsTable (services.training_presence_service.get_sign_in_roster
        i _participant_json w routes/trainings/routes.py budują z tego set()
        po training_participant_id, zamiast osobnego zapytania per wiersz)."""
        return self._fetch_all(
            "SELECT pc.* FROM training_presence_confirmations pc "
            "JOIN training_participants tp ON tp.id = pc.training_participant_id "
            "WHERE tp.training_id = %s",
            (training_id,),
        )

    def create(
        self, training_participant_id: int, sign_in_token_id: Optional[int],
        signature_name: str, signature_svg: Optional[str],
        ip_address: Optional[str], user_agent: Optional[str],
    ) -> int:
        new_id = self._execute_insert(
            "INSERT INTO training_presence_confirmations "
            "(training_participant_id, sign_in_token_id, signature_name, signature_svg, ip_address, user_agent) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (training_participant_id, sign_in_token_id, signature_name, signature_svg, ip_address, user_agent),
        )
        # AuditableMixin._current_user_identity() returns (None, None) with no
        # request/login context — safe from this public, unauthenticated write.
        self._audit('CREATE', training_participant_id, label=signature_name)
        return new_id
