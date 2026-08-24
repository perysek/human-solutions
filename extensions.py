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
import os

from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# 'memory://' by default (single-worker constraint, see the docstring above
# and config/runtime_guards.py) — set RATELIMIT_STORAGE_URI=redis://... once
# workers > 1 or you run more than one app node. See SCALING_PREP_PLAN.md
# Phase 4 / MULTI_TENANCY_PROPOSAL.md §6.
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=os.environ.get('RATELIMIT_STORAGE_URI', 'memory://'),
)
