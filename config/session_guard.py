"""
Session idle-timeout guard (AUTH_4).

Logs a user out after SESSION_IDLE_TIMEOUT_MINUTES of inactivity, independent
of PERMANENT_SESSION_LIFETIME (the 30-day "remember me" sliding ceiling set in
config/auth_config.create_app — see app.py). The two are deliberately
different mechanisms:

  * PERMANENT_SESSION_LIFETIME — how long a session cookie stays valid at all,
    refreshed on every request Flask touches the session (a long ceiling).
  * this guard — how long a *logged-in* user may sit idle before being force-
    logged-out, checked and enforced on every request (a much shorter window).

Implementation: a single ``app.before_request`` hook comparing
``session['last_activity']`` against ``now``. Flask session cookies are
signed but not encrypted, so storing a plain ISO timestamp in them is fine
(it's not secret) and avoids a DB round-trip on every request.
"""
import os
from datetime import datetime, timedelta

from flask import session
from flask_login import current_user, logout_user

DEFAULT_IDLE_TIMEOUT_MINUTES = 30


def _idle_timeout_minutes() -> int:
    try:
        return int(os.environ.get('SESSION_IDLE_TIMEOUT_MINUTES', DEFAULT_IDLE_TIMEOUT_MINUTES))
    except (TypeError, ValueError):
        return DEFAULT_IDLE_TIMEOUT_MINUTES


def register_idle_timeout(app) -> None:
    """Install the idle-timeout ``before_request`` hook on ``app``."""

    @app.before_request
    def _enforce_idle_timeout():
        if not current_user.is_authenticated:
            return None

        timeout = timedelta(minutes=_idle_timeout_minutes())
        now = datetime.utcnow()
        last_activity_raw = session.get('last_activity')

        if last_activity_raw:
            try:
                last_activity = datetime.fromisoformat(last_activity_raw)
            except ValueError:
                last_activity = None
            if last_activity is not None and now - last_activity > timeout:
                logout_user()
                session.pop('last_activity', None)
                return None

        session['last_activity'] = now.isoformat()
        return None
