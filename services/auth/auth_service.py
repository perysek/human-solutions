"""
AuthService — the piece routes/auth/routes.py imports but that was missing
from the reference dump. Thin wrapper around UserRepository: routes stay
focused on request/response shape, this holds the actual login/password
business rules (matches the (success, user_or_none, error_or_none) /
(success, error_or_none) tuple contract the routes already call it with).
"""
from typing import Optional, Tuple

from database.models import User
from repositories.users.user_repository import UserRepository


class AuthService:
    def __init__(self, user_repo: UserRepository):
        self.user_repo = user_repo

    def authenticate(self, email: str, password: str) -> Tuple[bool, Optional[User], Optional[str]]:
        """Verify credentials. Returns (success, user, error_message)."""
        if not email or not password:
            return False, None, 'Podaj adres email i hasło.'

        user = self.user_repo.get_by_email(email)
        if not user:
            return False, None, 'Nieprawidłowy email lub hasło.'

        if not self.user_repo.verify_password(user, password):
            return False, None, 'Nieprawidłowy email lub hasło.'

        if not user.is_active:
            return False, None, 'Konto zostało dezaktywowane.'

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
