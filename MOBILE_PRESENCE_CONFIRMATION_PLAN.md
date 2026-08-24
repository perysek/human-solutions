# Mobile Presence Confirmation — Implementation Plan

Replaces the printed "lista obecności" (participants list) + wet signature at
in-person trainings with a phone-based confirmation employees fill in
themselves, scoped to one training session via a QR code / link. Not part of
the original 10-phase `IMPLEMENTATION_PLAN.md` roadmap — this is a new
initiative on top of the completed Phases 0–7 (`trainings` /
`training_participants`, `routes/trainings/routes.py`,
`repositories/trainings/training_participant_repository.py`).

This revision has been audited for **fresh-session buildability**: every
section below names exact files, exact existing patterns to copy, and two
concrete gotchas (§4.4, §4.5) a session without this document's research
would very likely miss and ship broken.

---

## 1. Business workflow

Actors: **HR/Trainer** (logged into the existing SPA), **Employee** (no
account in this system today — identified only as a `workers` row), **System**.

1. HR/Trainer opens a training's detail page (`TrainingViewPage`) and clicks
   "Generuj listę obecności" → backend mints a single-use, training-scoped
   **sign-in token** and returns a URL (`/confirm/<token>`) + a server-rendered
   QR PNG. The trainer displays it (screen or printed on the agenda — the one
   surviving paper is the QR itself, not a sheet everyone signs).
2. Employees scan it with their own phone — no app install, no login, no
   account creation. Friction must be ≤ signing a paper sheet or nobody uses it.
3. The mobile page shows the training's name/date and the roster scoped to
   *that* token only. The employee finds their own name/row.
4. To confirm: (a) select their row, (b) type their own **employee ID**
   (the `workers.id` text code, already known to them — not guessable from
   the visible name list) as a second factor against buddy-punching, (c) tick
   "Potwierdzam, że byłem/am obecny/a" and type their full name as the
   e-signature. An optional draw-your-signature pad adds evidentiary weight
   but is not load-bearing.
5. On submit: one immutable confirmation row is written (timestamp, IP,
   user-agent, which token was used). A second attempt for the same
   participant is rejected (409) — same one-shot semantics the codebase
   already uses for duplicate training enrollment (`exists_active` /
   `idx_training_participants_training_worker_active`, migration
   `a7b8c9d0e1f2`).
6. Back in the SPA, `ParticipantsTable` shows a live "Potwierdzone: 12/18"
   badge and a ✓ per row.
7. The token expires automatically (default: end of `training_date` + a few
   hours grace) or is revoked early by HR/Trainer once the session is over.
8. Export: the existing CSV export (`TRN_11`,
   `csv_export_service.export_training_participants_csv`) gains
   `confirmed_at` / `signature_name` columns — this *is* the artifact that
   replaces the scanned paper sheet in an audit/inspection.

Corrections (wrong tap, forgot, technical failure) are **not** self-service:
HR/Trainer manually marks presence from the authenticated app via the
existing `training_service.update_participant` path (audited). No
update/delete route exists on the public side at all.

---

## 2. Why this stack / methodology (not a native app)

**One new unauthenticated, token-scoped route pair on the existing React SPA
+ Flask/Postgres stack. Not a native app, not a new service.**

- **Zero install friction is the entire value proposition.** A native app
  has store review, install time, OS fragmentation, update lag — any of
  which and the employee signs paper instead. A URL behind a QR opens in the
  phone's existing browser in one tap, on any BYOD device.
- **No employee-account system to hang a native app on.** `workers` rows
  have no login today (only the ~4-role `users` table goes through
  Flask-Login, `routes/auth/routes.py`). Building employee auth for one
  sign-in-sheet flow would dwarf the actual problem. A short-lived,
  training-scoped token sidesteps it: identity is "presence in the room with
  the QR" + the employee-ID second factor, not a persistent account.
- **The codebase already has the exact precedent to copy**: the
  forgot/reset-password flow (`routes/auth/routes.py:139-224`) —
  `secrets.token_urlsafe(32)` stored in `password_reset_tokens` with
  `expires_at`/`used`, an endpoint with no `@login_required`, single-use
  enforced at the DB layer, and a matching unauthenticated frontend page
  (`frontend/src/pages/auth/ResetPasswordPage.tsx`, route
  `/reset-password/:token` in `router.tsx`, **outside**
  `<ProtectedRoute>`/`<AppShell>`). This plan reuses that exact shape end to
  end rather than inventing a new auth primitive.
- **Reuses the `routes → services → repositories` layering and the audit
  engine.** `AuditableMixin` (`repositories/auditable.py`) is *already
  designed for unauthenticated writers* — its docstring names "public
  booking" explicitly, and `_current_user_identity()` returns `(None, None)`
  gracefully with no request/login context rather than raising. So the new
  repository can mix it in exactly like every other write repository, no
  special-casing needed.
- **Server-side QR generation, not a new frontend dependency.** `Pillow` is
  already in `requirements.txt` (used for OCR). Adding the pure-Python
  `qrcode` package (PNG rendering backed by the Pillow already installed)
  lets the admin endpoint return a ready PNG (base64) with zero new frontend
  dependencies, versus adding a JS QR library to a frontend that currently
  has exactly 4 runtime dependencies (`frontend/package.json`).
- **PWA polish, not offline data capture.** A `manifest.json` for "add to
  home screen" is fine; the confirmation POST itself must happen online — an
  offline-queued signature has no verifiable timestamp/IP at the moment of
  attendance, reintroducing the "did they actually sign it there" ambiguity
  paper already has. No-signal venue → same fallback as today, HR marks it
  manually.
- **The one genuinely new piece of infrastructure is `Flask-Limiter`.**
  Everything else (Postgres, Alembic, the repository/service pattern, the
  React build) already exists and has run through six prior phases.

---

## 3. Data model

Two new tables, scoped to `trainings` / `training_participants` rather than
touching their columns — keeps the admin-editable enrollment record
(`start_date`, `remarks`, `trainer_id`, `effectiveness_date`) separate from
the employee-submitted, write-once confirmation. Mirrors how
`birth_data`/`foreigner_data` were split off `workers` instead of bolted on.

**Current Alembic head is `a7b8c9d0e1f2`** (`alembic heads`, verify again at
build time — another migration may have landed since) — the new revision's
`down_revision` must point to whatever `alembic heads` reports *then*, not
necessarily this value.

```python
# alembic/versions/<new_rev>_create_presence_confirmation_tables.py
"""create_presence_confirmation_tables

Revision ID: <new_rev>
Revises: a7b8c9d0e1f2   # <- confirm with `alembic heads` before generating
"""
from alembic import op
import sqlalchemy as sa

def upgrade() -> None:
    op.create_table(
        'training_sign_in_tokens',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('training_id', sa.Integer(), nullable=False),
        sa.Column('token', sa.Text(), nullable=False),
        sa.Column('created_by_user_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['training_id'], ['trainings.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.UniqueConstraint('token'),
    )
    op.create_index('idx_sign_in_tokens_training', 'training_sign_in_tokens', ['training_id'])

    op.create_table(
        'training_presence_confirmations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('training_participant_id', sa.Integer(), nullable=False),
        sa.Column('sign_in_token_id', sa.Integer(), nullable=True),
        sa.Column('signature_name', sa.Text(), nullable=False),
        sa.Column('signature_svg', sa.Text(), nullable=True),
        sa.Column('ip_address', sa.Text(), nullable=True),
        sa.Column('user_agent', sa.Text(), nullable=True),
        sa.Column('confirmed_at', sa.DateTime(), nullable=False, server_default=sa.func.current_timestamp()),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['training_participant_id'], ['training_participants.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['sign_in_token_id'], ['training_sign_in_tokens.id'], ondelete='SET NULL'),
        sa.UniqueConstraint('training_participant_id'),
    )

def downgrade() -> None:
    op.drop_table('training_presence_confirmations')
    op.drop_table('training_sign_in_tokens')
```

`UniqueConstraint('training_participant_id')` is the DB-level guarantee
behind the 409 in workflow step 5 — same belt-and-suspenders approach as
`a7b8c9d0e1f2_partial_unique_training_participants.py`: the service checks
first for a friendly error, the constraint makes a race condition
impossible, not just unlikely.

**Operational gotcha (`config/database.py:256`, `assert_schema_current`)**:
`app.py`'s `create_app()` calls this at boot and **refuses to start** if
`alembic_version` is present but behind head. After generating this
migration, `alembic upgrade head` must be run against the dev DB (see
`run_dev.py`'s docstring for the SSH-tunnel setup) before `python run_dev.py`
will boot at all — this isn't optional cleanup, it's a hard startup gate.

---

## 4. Backend implementation

New repositories + one service, same three-layer split as `training_service.py`.

### 4.1 `repositories/trainings/training_sign_in_repository.py`

```python
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
    audit_entity_type = 'training'  # audited under the training entity, same convention
                                     # as TrainingParticipantRepository (see that file's docstring)

    def __init__(self):
        super().__init__('training_sign_in_tokens')

    def get_active_by_training(self, training_id: int) -> Optional[Any]:
        return self._fetch_one(
            _SELECT + " WHERE training_id = %s AND revoked_at IS NULL AND expires_at > NOW() "
            "ORDER BY created_at DESC LIMIT 1",
            (training_id,),
        )

    def get_by_token(self, token: str) -> Optional[Any]:
        return self._fetch_one(_SELECT + " WHERE token = %s", (token,))

    def revoke_active(self, training_id: int) -> None:
        self._execute(
            "UPDATE training_sign_in_tokens SET revoked_at = CURRENT_TIMESTAMP "
            "WHERE training_id = %s AND revoked_at IS NULL",
            (training_id,),
        )

    def create(self, training_id: int, created_by_user_id: Optional[int], ttl_hours: int = 12) -> tuple[int, str]:
        token = secrets.token_urlsafe(32)          # same primitive as password_reset_tokens
        expires_at = datetime.utcnow() + timedelta(hours=ttl_hours)
        new_id = self._execute_insert(
            "INSERT INTO training_sign_in_tokens (training_id, token, created_by_user_id, expires_at) "
            "VALUES (%s, %s, %s, %s)",
            (training_id, token, created_by_user_id, expires_at),
        )
        self._audit('CREATE', training_id, label='sign-in-link')
        return new_id, token
```

### 4.2 `repositories/trainings/training_presence_repository.py`

```python
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
        """Left-joinable map for ParticipantsTable's ✓ badges — see §4.3's
        note on extending _participant_json instead of a separate endpoint."""
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
        self._audit('CREATE', training_participant_id, label=signature_name)
        return new_id
```

### 4.3 `services/training_presence_service.py`

Mirrors `services/training_service.py`'s validation order (existence →
ownership/scope → business-rule checks → transaction).

```python
from flask import request

from config.database import managed_transaction
from exceptions import ConflictError, GoneError, NotFoundError, ValidationError  # GoneError: add to exceptions.py, status_code = 410
from repositories.trainings.training_participant_repository import TrainingParticipantRepository
from repositories.trainings.training_sign_in_repository import TrainingSignInRepository
from repositories.trainings.training_presence_repository import TrainingPresenceRepository


def _load_valid_token(token: str):
    row = TrainingSignInRepository().get_by_token(token)
    if not row:
        raise NotFoundError('Link jest nieprawidłowy')
    if row['revoked_at'] is not None:
        raise GoneError('Ten link został unieważniony')
    from datetime import datetime
    if row['expires_at'] <= datetime.utcnow():
        raise GoneError('Ten link wygasł')
    return row


def get_sign_in_roster(token: str) -> dict:
    token_row = _load_valid_token(token)
    training = TrainingRepository().get_by_id(token_row['training_id'])  # 404 shouldn't
                                                                          # happen (FK CASCADE
                                                                          # deletes the token
                                                                          # with the training)
                                                                          # but check anyway
    if not training:
        raise NotFoundError('Szkolenie nie znalezione')
    participants = TrainingParticipantRepository().get_by_training(token_row['training_id'])
    confirmed_ids = {
        c['training_participant_id'] for c in TrainingPresenceRepository().get_by_training(token_row['training_id'])
    }
    return {
        'training': {
            'description': training['description'],
            'training_date': training['training_date'].isoformat() if training['training_date'] else None,
        },
        'participants': [
            {
                'id': p['id'],
                'display_name': f"{p['worker_firstname']} {p['worker_surname']}",
                'confirmed': p['id'] in confirmed_ids,
            }
            for p in participants
        ],
    }


def confirm_presence(token: str, payload: dict) -> int:
    token_row = _load_valid_token(token)

    participant_id = payload.get('participant_id')
    if not participant_id:
        raise ValidationError('Nie wybrano uczestnika')
    participant = TrainingParticipantRepository().get_by_id(participant_id)
    if not participant or participant['training_id'] != token_row['training_id']:
        raise NotFoundError('Uczestnik nie znaleziony dla tego szkolenia')

    employee_id = (payload.get('employee_id') or '').strip()
    if employee_id != participant['worker_id']:
        raise ValidationError('Numer pracownika nie zgadza się z wybraną osobą')

    signature_name = (payload.get('signature_name') or '').strip()
    if not signature_name:
        raise ValidationError('Podpis (imię i nazwisko) jest wymagany')
    if not payload.get('consent_ack'):
        raise ValidationError('Potwierdzenie obecności jest wymagane')

    if TrainingPresenceRepository().get_by_participant(participant_id):
        raise ConflictError('Obecność już została potwierdzona')

    with managed_transaction():
        new_id = TrainingPresenceRepository().create(
            participant_id, token_row['id'], signature_name,
            payload.get('signature_svg'),
            request.remote_addr,          # correct only once ProxyFix is installed — see §4.5
            request.headers.get('User-Agent'),
        )
    return new_id
```

`GoneError` (410) doesn't exist yet in `exceptions.py` — add it next to
`ConflictError`:

```python
class GoneError(AppError):
    """Referenced resource existed but is no longer valid (expired/revoked token)."""
    status_code = 410
```

### 4.4 `routes/public/routes.py` — deliberately outside every existing auth gate

```python
import logging
from flask import Blueprint, request, jsonify

from exceptions import AppError
import services.training_presence_service as training_presence_service
from extensions import limiter  # see §4.5 — Flask-Limiter instance created in app.py

public_bp = Blueprint('public', __name__, url_prefix='/public')

# No @login_required, no module_permission_required/role_required anywhere in
# this file — those decorators assume current_user (config/auth_config.py:80
# checks current_user.is_authenticated first) and would 401 every legitimate
# caller. The token IS the auth here.

@public_bp.route('/sign-in/<token>', methods=['GET'])
@limiter.limit('30/minute')
def get_sign_in(token):
    try:
        return jsonify(training_presence_service.get_sign_in_roster(token))
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in get_sign_in (public)')
        raise AppError('Wystąpił błąd serwera')


@public_bp.route('/sign-in/<token>/confirm', methods=['POST'])
@limiter.limit('10/minute')
def confirm_sign_in(token):
    data = request.get_json() or {}
    try:
        new_id = training_presence_service.confirm_presence(token, data)
        return jsonify({'success': True, 'id': new_id}), 201
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in confirm_sign_in (public)')
        raise AppError('Wystąpił błąd serwera')
```

Register in `app.py` next to the other blueprints:

```python
from routes.public.routes import public_bp
app.register_blueprint(public_bp)
```

**Admin-side additions to the existing `routes/trainings/routes.py`**
(same file, same `@login_required` + `role_required('superadmin','hr_manager')`
+ `assert_trainer_can_edit` pattern as the job/skill-link endpoints at
`routes/trainings/routes.py:183-250`):

| Method & path | Purpose |
|---|---|
| `POST /trainings/api/<id>/sign-in-link` | Revoke any existing active token (`TrainingSignInRepository.revoke_active`), mint a new one, render its QR server-side (`qrcode` → PNG → base64), return `{token, url, qr_png_base64, expires_at}`. |
| `GET /trainings/api/<id>/sign-in-link` | Current active link (if any) + `{confirmed, total}` counts for the live badge. |
| `DELETE /trainings/api/<id>/sign-in-link` | `revoke_active(training_id)`. |

`GET /trainings/api/<id>/participants` (`routes/trainings/routes.py:255-272`)
gains `confirmed`/`confirmed_at` on `_participant_json` (left-join to
`training_presence_confirmations`, or reuse
`TrainingPresenceRepository.get_by_training` as a lookup set like
`get_sign_in_roster` does above) — no separate endpoint needed for the
roster ✓ badges.

### 4.5 Two gotchas a fresh session will otherwise hit

**A. `request.remote_addr` is wrong in production without `ProxyFix`.**
`DEPLOYMENT_VULTR.md:459-461` shows Nginx sets `X-Real-IP`/`X-Forwarded-For`
correctly, but **`app.py` has no `ProxyFix` anywhere today** (verified —
`grep -rn ProxyFix app.py config/` returns nothing). Without it,
`request.remote_addr` in prod is Nginx's own loopback address for *every*
request — which silently breaks both the `ip_address` audit column (§3) and
Flask-Limiter's default per-IP key (everyone shares one bucket, so one
overzealous employee's phone locks out the whole room). Fix, in
`app.py`'s `create_app()`, immediately after `app = Flask(__name__)`:

```python
from werkzeug.middleware.proxy_fix import ProxyFix
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
```

`x_for=1` trusts exactly one proxy hop, matching Nginx being the only proxy
in front of Gunicorn. Safe in dev too — `run_dev.py` never sends
`X-Forwarded-For`, so `ProxyFix` no-ops and `remote_addr` stays as-is.

**B. In-memory `Flask-Limiter` storage is fine here — verify, don't assume.**
`gunicorn.conf.py` pins `workers = 1` (`gthread`, 4 threads) and hard-fails
boot via `assert_single_worker` if that's ever changed — single OS process,
so in-memory rate-limit counters can't fragment across workers the way they
would with `workers > 1`. No Redis needed. **If `gunicorn.conf.py`'s
`workers` value ever changes, this stops being true** and the limiter needs
`storage_uri='redis://...'` — worth a one-line comment at the `Limiter(...)`
call site pointing back here.

Add to `requirements.txt`:
```
Flask-Limiter>=3.8,<4.0
qrcode>=7.4,<8.0   # PNG rendering via the Pillow already in this file
```

`extensions.py` (new, tiny — avoids a circular import between `app.py` and
`routes/public/routes.py`):
```python
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
```
Then in `create_app()`, after the `ProxyFix` line: `limiter.init_app(app)`.

---

## 5. Frontend implementation

### 5.1 `frontend/vite.config.ts` — new proxy entry

`/public` has no React Router page today (unlike `/trainings`, `/workers`,
etc.), so — same reasoning as the existing `/auth` and `/system` entries —
it's proxied whole, not scoped to a `/public/api` suffix:

```ts
'/public': { target: 'http://127.0.0.1:5001', changeOrigin: true },
```
Add it next to the existing entries at `frontend/vite.config.ts:23-40`.

### 5.2 `frontend/src/router.tsx` — new unauthenticated route

Same tier as `/reset-password/:token` (`router.tsx:43-45`), **outside**
`<ProtectedRoute>`/`<AppShell>`:

```tsx
import { PresenceConfirmPage } from '@/pages/public/PresenceConfirmPage';
// ...
<Route path="/confirm/:token" element={<PresenceConfirmPage />} />
```

### 5.3 `frontend/src/pages/public/PresenceConfirmPage.tsx`

Structural copy of `frontend/src/pages/auth/ResetPasswordPage.tsx` (reads
`token` via `useParams`, wraps in `AuthLayout`, `refined-card`/`refined-title`/
`refined-input`/`refined-btn-primary`/`flash-message flash-error` CSS
classes already defined for the auth pages, `api`/`ApiError` from
`@/lib/api/client`). Three states in one component:

1. **Loading** — `GET /public/sign-in/:token` on mount → roster + training header.
2. **Form** — tap a roster row (radio-style selection, big touch targets —
   this is a phone in someone's hand, not a desktop form) → reveal
   employee-ID input + signature-name input + consent checkbox → submit
   button disabled until all three are filled.
3. **Success / error** — `POST /public/sign-in/:token/confirm`; on 409 show
   "already confirmed" (not an error tone — it's an idempotent, friendly
   outcome); on 410 show "link expired, ask HR"; on other `AppError` show
   `err.message` same as `ResetPasswordPage.tsx`'s catch block.

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { api, ApiError } from '@/lib/api/client';

type Participant = { id: number; display_name: string; confirmed: boolean };
type Roster = { training: { description: string; training_date: string | null }; participants: Participant[] };

export function PresenceConfirmPage() {
  const { token } = useParams<{ token: string }>();
  const [roster, setRoster] = useState<Roster | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [employeeId, setEmployeeId] = useState('');
  const [signatureName, setSignatureName] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api.get<Roster>(`/public/sign-in/${token}`)
      .then(setRoster)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Nie udało się połączyć z serwerem.'));
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      await api.post(`/public/sign-in/${token}/confirm`, {
        participant_id: selectedId,
        employee_id: employeeId,
        signature_name: signatureName,
        consent_ack: consent,
      });
      setDone(true);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Nie udało się połączyć z serwerem.');
    } finally {
      setSubmitting(false);
    }
  }

  // loading / loadError / done / form-with-selectedId branches render here —
  // same refined-card/AuthLayout shell as ResetPasswordPage.tsx.
}
```

### 5.4 Admin-side additions

- `TrainingViewPage.tsx` — a "Lista obecności" panel: generate/revoke button,
  QR `<img src={`data:image/png;base64,${qr_png_base64}`} />`, live
  `confirmed/total` count.
- `ParticipantsTable.tsx` — a ✓ column reading the `confirmed` field added to
  `_participant_json` in §4.4's admin-side table.
- CSV export (`csv_export_service.export_training_participants_csv`) —
  add `confirmed_at`/`signature_name` columns, same left-join as the roster query.

---

## 6. CRUD matrix

| Entity | Create | Read | Update | Delete |
|---|---|---|---|---|
| `training_sign_in_tokens` | HR/Trainer (own training) — `POST .../sign-in-link` | Admin (status); implicitly the public GET (validity check) | never (regenerate = revoke + new row) | HR/Trainer/Admin — `DELETE .../sign-in-link`, early revoke |
| `training_presence_confirmations` | **Employee only**, public POST, exactly once per participant (DB `UniqueConstraint`) | Admin/Trainer (roster + CSV export); employee sees their own on the immediate success screen | **never** — corrections go through `training_service.update_participant` (existing audited path) | Admin only, cascades when the parent `training_participants` row is hard-removed (the existing soft-delete already `CASCADE`s correctly on hard delete only, which never happens in normal operation) |

---

## 7. Security & abuse prevention

- **Scope, not identity, is the boundary.** The token proves "you were
  handed this link/QR for this session," not who you are — same trust model
  as a printed sheet in a room. `employee_id` is the cheap second factor
  against confirming for someone else visible on the shared roster.
- **Time-boxed**: `expires_at` default 12h from generation (tunable),
  revocable early.
- **Single-use per participant**, enforced by the DB unique constraint, not
  just application logic (§3).
- **Rate-limited**: 30/min GET, 10/min POST per IP (§4.4/§4.5) — the one
  genuinely new abuse surface, since `app.py` currently skips CSRF *because*
  every existing consumer is the authenticated SPA (see the comment at
  `app.py:73-79`); a public unauthenticated POST breaks that assumption, so
  it needs its own guardrail. **Correctness of this guardrail depends on
  §4.5-A (`ProxyFix`)** — without it, rate limiting is either useless
  (everyone = one IP) or wrong; this dependency must not be skipped.
- **PII minimization on the public GET**: `display_name` only, scoped to
  that one training's roster (parity with what a printed sheet already
  exposes to everyone in the room) — never PESEL, medical data, or any other
  worker field. Mirrors the existing `_redact_participant_for_viewer`
  instinct (`routes/trainings/routes.py:72-78`), applied here for public
  exposure rather than role redaction.
- **Immutable + audited.** No update/delete route exists for a confirmation
  row from the public side. `AuditableMixin`'s `_audit` call in
  `TrainingPresenceRepository.create` records the write even though there is
  no `current_user` (see §2's note on `_current_user_identity()`), so "who
  confirmed what, when" is in `audit_log` the same as every other mutation
  in this app.

---

## 8. Implementation checklist (build order)

1. `alembic heads` → confirm current head, generate migration (§3), `alembic upgrade head` against the dev DB.
2. `exceptions.py` — add `GoneError` (410).
3. `requirements.txt` — add `Flask-Limiter`, `qrcode`.
4. `extensions.py` — new, `limiter = Limiter(...)`.
5. `app.py` — `ProxyFix` (§4.5-A), `limiter.init_app(app)`, register `public_bp`.
6. `repositories/trainings/training_sign_in_repository.py` (§4.1).
7. `repositories/trainings/training_presence_repository.py` (§4.2).
8. `services/training_presence_service.py` (§4.3).
9. `routes/public/routes.py` (§4.4).
10. Admin-side additions to `routes/trainings/routes.py` (§4.4's table) + `_participant_json` `confirmed` field + `csv_export_service.py` columns.
11. `frontend/vite.config.ts` — `/public` proxy entry (§5.1).
12. `frontend/src/pages/public/PresenceConfirmPage.tsx` (§5.3).
13. `frontend/src/router.tsx` — `/confirm/:token` route (§5.2).
14. `TrainingViewPage.tsx` + `ParticipantsTable.tsx` admin panel/column (§5.4).
15. Verification (§9).

---

## 9. Verification

No backend `pytest` suite exists for the `trainings` domain today (none
found under any `tests/` path) — verification here is the same manual
pattern prior sessions used for this module (see repo history on
`training_participants`/`ParticipantsTable` work):

- Backend: `python run_dev.py` (needs the SSH tunnel per that file's
  docstring, and step 1's `alembic upgrade head` already applied) — confirm
  it boots (validates §3's `assert_schema_current` gate passed) and exercise
  the new endpoints with `curl`/Postman before wiring the frontend.
- Frontend: from `frontend/`, `npm run lint` and `npm run build` (`tsc -b`
  is part of `build`, no separate `typecheck` script exists) must both pass
  clean.
- End-to-end: `npm run dev` (port 5173) + `python run_dev.py` (port 5001),
  smoke-test the full flow with Playwright (MCP tools available in this
  environment) — generate a link as an authenticated `hr_manager`, open
  `/confirm/:token` in a fresh (unauthenticated) context, confirm one
  participant, verify the 409 on a second attempt, verify the roster ✓ badge
  updates, verify CSV export includes the new columns.

---

## 10. Open business questions (defaults assumed above, confirm before shipping)

1. **Roster visibility on the public page** — full names shown to anyone
   with the link (parity with paper, assumed above) vs. each employee
   searching/typing their own name (stricter, more RODO-conservative, more
   friction). Real trade-off for the business, not a technical default.
2. **Evidentiary weight of a typed-name signature** under Polish labor/BHP
   record-keeping rules — good internal evidence, but may not carry the same
   legal weight as a wet signature for statutory BHP training registers
   specifically. Worth a legal check before this fully replaces paper for
   BHP sessions (vs. internal/soft-skill trainings, a clear win either way).
   `signature_svg` (drawn signature) narrows the gap if needed — schema
   already supports it (§3), just not wired into the UI by default above.
3. **Token distribution channel** — screen-projected QR only (assumed
   above), or also a per-participant link by SMS/email (needs contact info
   `workers` doesn't currently store).
4. **`expires_at` default window** — 12h grace (assumed above) vs. same-day-only.
