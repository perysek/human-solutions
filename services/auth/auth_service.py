"""
AuthService — the piece routes/auth/routes.py imports but that was missing
from the reference dump. Thin wrapper around UserRepository: routes stay
focused on request/response shape, this holds the actual login/password
business rules (matches the (success, user_or_none, error_or_none) /
(success, error_or_none) tuple contract the routes already call it with).
"""
import os
from datetime import datetime, timedelta
from typing import Optional, Tuple

from config.ui_messages import msg
from database.models import User
from repositories.audit_repository import AuditRepository
from repositories.users.user_repository import UserRepository

DEFAULT_MAX_FAILED_LOGINS = 5
DEFAULT_LOCKOUT_MINUTES = 30


def _max_failed_logins() -> int:
    try:
        return int(os.environ.get('MAX_FAILED_LOGINS', DEFAULT_MAX_FAILED_LOGINS))
    except (TypeError, ValueError):
        return DEFAULT_MAX_FAILED_LOGINS


def _lockout_minutes() -> int:
    try:
        return int(os.environ.get('LOCKOUT_MINUTES', DEFAULT_LOCKOUT_MINUTES))
    except (TypeError, ValueError):
        return DEFAULT_LOCKOUT_MINUTES


class AuthService:
    def __init__(self, user_repo: UserRepository):
        self.user_repo = user_repo

    def authenticate(self, email: str, password: str) -> Tuple[bool, Optional[User], Optional[str]]:
        """Verify credentials. Returns (success, user, error_message).

        AUTH_5: an account is locked for LOCKOUT_MINUTES (default 30) after
        MAX_FAILED_LOGINS (default 5) consecutive bad-password attempts, and
        auto-unlocks once ``locked_until`` passes — on top of that, a
        superadmin can unlock it early via PUT /system/users/api/<id>/unlock
        (both mechanisms apply simultaneously, per IMPLEMENTATION_PLAN.md
        §15's resolved AUTH_5 contradiction).
        """
        if not email or not password:
            return False, None, 'Podaj adres email i hasło.'

        user = self.user_repo.get_by_email(email)
        if not user:
            return False, None, 'Nieprawidłowy email lub hasło.'

        if self.user_repo.is_locked(user.id):
            return False, None, msg('auth.login.account_locked', minutes=_lockout_minutes())

        if not self.user_repo.verify_password(user, password):
            attempts = self.user_repo.increment_failed_logins(user.id)
            if attempts >= _max_failed_logins():
                self.user_repo.lock_account(
                    user.id, datetime.now() + timedelta(minutes=_lockout_minutes())
                )
                AuditRepository().safe_log_event(
                    entity_type='login', action='ACCOUNT_LOCKED',
                    entity_id=user.id, entity_label=user.email,
                    new_value=f'{_lockout_minutes()} min',
                )
                return False, None, msg('auth.login.newly_locked', minutes=_lockout_minutes())
            remaining = _max_failed_logins() - attempts
            return False, None, msg('auth.login.bad_credentials_with_attempts', remaining=remaining)

        if not user.is_active:
            return False, None, 'Konto zostało dezaktywowane.'

        self.user_repo.reset_failed_logins(user.id)
        self.user_repo.update_last_login(user.id)
        return True, user, None

    def change_password(self, user_id: int, old_password: str, new_password: str) -> Tuple[bool, Optional[str]]:
        """Verify the old password and set a new one. Returns (success, error_message)."""
        row = self.user_repo.get_by_id(user_id)
        if not row:
            return False, 'Użytkownik nie istnieje.'

        user = self.user_repo.row_to_user(row)
        if not self.user_repo.verify_password(user, old_password):
            return False, 'Nieprawidłowe obecne hasło.'

        if len(new_password) < 8:
            return False, 'Nowe hasło musi mieć co najmniej 8 znaków.'

        self.user_repo.update_password(user_id, new_password)
        return True, None
