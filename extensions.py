"""Shared Flask extension instances that both `app.py` and route modules need
to import without creating a circular import between them.

`limiter` — Flask-Limiter, added for MOBILE_PRESENCE_CONFIRMATION_PLAN.md's
public sign-in endpoints (routes/public/routes.py), the one genuinely new
public/unauthenticated attack surface in this app (app.py's CSRF-skip
comment holds only because every other consumer is the authenticated SPA).
Default in-memory storage is deliberate, not an oversight: gunicorn.conf.py
pins `workers = 1` (single OS process, enforced by `assert_single_worker`),
so in-memory counters can't fragment across workers. If that ever changes to
`workers > 1`, this needs `storage_uri='redis://...'` instead.
"""
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# storage_uri is explicit (not the implicit in-memory default) so this reads
# as a deliberate choice — see the module docstring — rather than a
# forgotten TODO; it also silences flask-limiter's "no storage configured"
# warning that would otherwise fire on every boot.
limiter = Limiter(key_func=get_remote_address, storage_uri='memory://')
