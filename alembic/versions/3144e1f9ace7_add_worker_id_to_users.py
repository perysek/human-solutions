"""add_worker_id_to_users

Revision ID: 3144e1f9ace7
Revises: dbd528235721
Create Date: 2026-08-20 14:11:35.302365

Closes a gap IMPLEMENTATION_PLAN.md flagged back in its Phase 0 pre-work
(§5's "stan obecny" audit) but that no phase actually needed until now:
`users.worker_id`, nullable, linking a login account to the `workers` row it
represents. `failed_logins`/`locked_until` (the migration's siblings from
that same audit) landed in Phase 0 because AUTH_5 needed them immediately;
`worker_id` didn't have a consumer until Phase 5's `own_data_worker_id()`
(cross-cutting decision #6) — a trainer's "edit only my own trainings" gate
reads this column directly off the logged-in user, no join required.

Nullable per OQ_6 (confirmed): `superadmin`/`hr_manager` accounts need no
worker row; `trainer` accounts should have one, but `own_data_worker_id()`
degrades safely (sentinel `-1`) if one doesn't. ON DELETE SET NULL — a
worker leaving (or, rare, a hard-deleted worker row) must not cascade into
deleting the *login account*, just detach it.

No-op (2026-08-24): `f5a6b7c8d9e0` (down_revision chain: ...e4f5a6b7c8d9 ->
f5a6b7c8d9e0 -> a6b7c8d9e0f1 -> dbd528235721 -> 3144e1f9ace7...), earlier in
this same chain, already adds this exact column + `fk_users_worker_id`
constraint as part of creating the `workers` table. Whatever historical
reason had this migration doing it again too, running the chain against a
genuinely fresh database (a new CI Postgres container, a new dev machine)
hit `DuplicateColumn`/`DuplicateObject` at this revision — head was
unreachable from scratch. Any database that already applied this revision
(dev, prod) keeps its column/constraint untouched; this file's body is
neutered so the *next* fresh build succeeds. The real add/drop now lives
solely in `f5a6b7c8d9e0`.
"""
from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = '3144e1f9ace7'
down_revision: Union[str, None] = 'dbd528235721'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass  # see module docstring — f5a6b7c8d9e0 (earlier in chain) already does this


def downgrade() -> None:
    pass  # see module docstring — f5a6b7c8d9e0's downgrade() is what actually drops it
