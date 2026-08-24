"""
Repository dla powiązania szkolenia z trenerami (training_trainers).

Analogicznie do TrainingJobRepository/TrainingSkillRepository — patrz jego
docstring dla uzasadnienia kształtu replace-the-whole-set. Różnica: łączy
się z `workers`, nie ze słownikiem (jobs/skills), więc `_SELECT` zwraca
imię/nazwisko trenera zamiast pojedynczego opisu — patrz
TrainingParticipantRepository._SELECT dla tego samego wzorca po stronie
uczestników (`w.firstname AS worker_firstname, w.surname AS worker_surname`).
"""
from typing import Any, List

from repositories.auditable import AuditableMixin
from repositories.base_repository import BaseRepository

_SELECT = """
    SELECT tt.id, tt.training_id, tt.trainer_id, w.firstname AS trainer_firstname, w.surname AS trainer_surname
    FROM training_trainers tt
    JOIN workers w ON w.id = tt.trainer_id
"""


class TrainingTrainerRepository(AuditableMixin, BaseRepository):
    audit_entity_type = 'training'

    def __init__(self):
        super().__init__('training_trainers')

    def get_by_training(self, training_id: int) -> List[Any]:
        return self._fetch_all(_SELECT + " WHERE tt.training_id = %s ORDER BY w.surname, w.firstname", (training_id,))

    def replace_links(self, training_id: int, trainer_ids: List[str]) -> None:
        """Replace the training's whole set of trainers in one call."""
        self._execute("DELETE FROM training_trainers WHERE training_id = %s", (training_id,))
        seen = set()
        for trainer_id in trainer_ids:
            trainer_id = (trainer_id or '').strip()
            if not trainer_id or trainer_id in seen:
                continue
            seen.add(trainer_id)
            self._execute(
                "INSERT INTO training_trainers (training_id, trainer_id) VALUES (%s, %s)",
                (training_id, trainer_id),
            )
        self._audit(
            'UPDATE', training_id, field_name='training_trainers',
            new=', '.join(sorted(seen)) or '(brak)',
        )
