"""
Repository dla uwag do oceny umiejętności pracownika (worker_skill_remarks, SKL_3).

Append-only — brak update()/delete(): korekta to nowa uwaga, nie edycja
istniejącej (patrz komentarz w migracji a6b7c8d9e0f1). Audytowane pod
audit_entity_type='worker' z entity_id=worker_id (przekazywane przez
wywołującego — routes/workers/routes.py zna worker_id z URL, więc nie
trzeba go doszukiwać przez JOIN).
"""
from typing import Any, List

from repositories.auditable import AuditableMixin
from repositories.base_repository import BaseRepository


class WorkerSkillRemarkRepository(AuditableMixin, BaseRepository):
    audit_entity_type = 'worker'

    def __init__(self):
        super().__init__('worker_skill_remarks')

    def get_by_worker_skill(self, worker_skill_id: int) -> List[Any]:
        return self._fetch_all(
            "SELECT id, worker_skill_id, remarks, created_at "
            "FROM worker_skill_remarks WHERE worker_skill_id = %s ORDER BY created_at DESC, id DESC",
            (worker_skill_id,),
        )

    def create(self, worker_skill_id: int, worker_id: str, remarks: str) -> int:
        new_id = self._execute_insert(
            "INSERT INTO worker_skill_remarks (worker_skill_id, remarks) VALUES (%s, %s)",
            (worker_skill_id, remarks),
        )
        self._audit('CREATE', worker_id, field_name='worker_skill_remarks', new=remarks)
        return new_id
