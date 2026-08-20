"""
Repository dla użytkowników (user accounts)
"""
from datetime import datetime
from typing import Any, Optional
import bcrypt

from config.database import get_db_connection
from database.models import User
from repositories.base_repository import BaseRepository
from repositories.db_utils import parse_dt


class UserRepository(BaseRepository):
    """Repository dla operacji na użytkownikach"""

    _columns = ('id, email, password_hash, full_name, role, is_active, last_login, '
                'failed_logins, locked_until, worker_id, created_at, updated_at')

    def __init__(self):
        super().__init__("users")

    def _validate_role(self, role: str) -> None:
        """Sprawdź czy rola istnieje w tabeli roles. Rzuca ValueError jeśli nie."""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT 1 FROM roles WHERE name = %s", (role,))
            if not cursor.fetchone():
                raise ValueError(f"Rola '{role}' nie istnieje w systemie")

    def create_user(self, email: str, password: str, full_name: str, role: str = 'viewer') -> int:
        """
        Utwórz nowego użytkownika z zahashowanym hasłem

        Args:
            email: Adres email (unikalny)
            password: Hasło w postaci jawnej (zostanie zahashowane)
            full_name: Imię i nazwisko
            role: Rola użytkownika (domyślnie 'viewer')

        Returns:
            ID nowego użytkownika
        """
        self._validate_role(role)
        # Hash password using bcrypt
        password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

        query = """
            INSERT INTO users (email, password_hash, full_name, role, is_active)
            VALUES (%s, %s, %s, %s, TRUE)
        """
        return self._execute_insert(query, (email, password_hash, full_name, role))

    def get_by_email(self, email: str) -> Optional[User]:
        """
        Pobierz użytkownika po adresie email

        Args:
            email: Adres email

        Returns:
            User object lub None jeśli nie znaleziono
        """
        query = f"SELECT {self._columns} FROM users WHERE email = %s"
        row = self._fetch_one(query, (email,))

        if not row:
            return None

        return self.row_to_user(row)

    def verify_password(self, user: User, password: str) -> bool:
        """
        Weryfikuj hasło użytkownika

        Args:
            user: Obiekt User
            password: Hasło do sprawdzenia (w postaci jawnej)

        Returns:
            True jeśli hasło poprawne, False w przeciwnym razie
        """
        return bcrypt.checkpw(
            password.encode('utf-8'),
            user.password_hash.encode('utf-8')
        )

    def update_last_login(self, user_id: int):
        """
        Zaktualizuj timestamp ostatniego logowania

        Args:
            user_id: ID użytkownika
        """
        query = "UPDATE users SET last_login = %s, updated_at = %s WHERE id = %s"
        self._execute(query, (datetime.now(), datetime.now(), user_id))

    def update_password(self, user_id: int, new_password: str):
        """
        Zaktualizuj hasło użytkownika

        Args:
            user_id: ID użytkownika
            new_password: Nowe hasło (w postaci jawnej, zostanie zahashowane)
        """
        password_hash = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        query = "UPDATE users SET password_hash = %s, updated_at = %s WHERE id = %s"
        self._execute(query, (password_hash, datetime.now(), user_id))

    def update_role(self, user_id: int, new_role: str):
        """
        Zaktualizuj rolę użytkownika

        Args:
            user_id: ID użytkownika
            new_role: Nowa rola
        """
        query = "UPDATE users SET role = %s, updated_at = %s WHERE id = %s"
        self._execute(query, (new_role, datetime.now(), user_id))

    def set_worker_id(self, user_id: int, worker_id: Optional[str]):
        """Link (or unlink, when ``worker_id`` is None) this login account to
        a `workers` row — the read side of Faza 5's own_data_worker_id()
        (config/auth_config.py). No admin UI calls this yet (not required by
        any TRN_* requirement); today's only caller is scripts/seed_dev_data.py,
        linking the dev `trainer@dev.local` account so TRN_7's ownership gate
        is exercisable locally without hand-written SQL."""
        query = "UPDATE users SET worker_id = %s, updated_at = %s WHERE id = %s"
        self._execute(query, (worker_id, datetime.now(), user_id))

    def deactivate(self, user_id: int):
        """
        Dezaktywuj konto użytkownika (soft delete)

        Args:
            user_id: ID użytkownika
        """
        query = "UPDATE users SET is_active = FALSE, updated_at = %s WHERE id = %s"
        self._execute(query, (datetime.now(), user_id))

    def activate(self, user_id: int):
        """
        Aktywuj konto użytkownika

        Args:
            user_id: ID użytkownika
        """
        query = "UPDATE users SET is_active = TRUE, updated_at = %s WHERE id = %s"
        self._execute(query, (datetime.now(), user_id))

    def get_by_role(self, role: str) -> list:
        """
        Pobierz wszystkich użytkowników o danej roli

        Args:
            role: Nazwa roli

        Returns:
            Lista obiektów User
        """
        query = f"SELECT {self._columns} FROM users WHERE role = %s AND is_active = TRUE ORDER BY full_name"
        rows = self._fetch_all(query, (role,))
        return [self.row_to_user(row) for row in rows]

    def get_active_users(self) -> list:
        """
        Pobierz wszystkich aktywnych użytkowników

        Returns:
            Lista obiektów User
        """
        query = f"SELECT {self._columns} FROM users WHERE is_active = TRUE ORDER BY full_name"
        rows = self._fetch_all(query)
        return [self.row_to_user(row) for row in rows]

    def list_all(self) -> list:
        """
        Pobierz wszystkich użytkowników, posortowanych po nazwie.
        Zwraca surowe Row objects z polami: id, email, full_name, role, is_active,
        last_login, created_at, failed_logins, locked_until.
        """
        query = f"SELECT {self._columns} FROM users ORDER BY full_name"
        return self._fetch_all(query)

    def update_user(self, user_id: int, email: str, full_name: str, role: str, is_active: bool):
        """
        Zaktualizuj dane użytkownika (email, imię, rola, aktywność).
        Nie aktualizuje hasła — użyj update_password() osobno.
        """
        self._validate_role(role)
        query = """
            UPDATE users
            SET email = %s, full_name = %s, role = %s, is_active = %s, updated_at = %s
            WHERE id = %s
        """
        self._execute(query, (email, full_name, role, is_active, datetime.now(), user_id))

    def delete_user(self, user_id: int) -> bool:
        """Usuń użytkownika."""
        query = "DELETE FROM users WHERE id = %s"
        cursor = self._execute(query, (user_id,))
        return cursor.rowcount > 0

    def hard_delete(self, user_id: int) -> bool:
        """Delete a user row while cooperating with an outer ``managed_transaction``.

        Unlike :meth:`delete_user`, this does NOT open its own ``self.transaction()``
        (which would ``commit()`` immediately and prematurely flush a caller's
        managed transaction). It routes through ``_execute`` → ``safe_commit``, so
        when wrapped in ``managed_transaction()`` the delete defers and commits
        atomically with the caller's other writes. Returns True when a row was removed.
        """
        cursor = self._execute("DELETE FROM users WHERE id = %s", (user_id,))
        return cursor.rowcount > 0

    # ── Account lockout (AUTH_5) ────────────────────────────────────────────

    def increment_failed_logins(self, user_id: int) -> int:
        """Bump the failed-attempt counter and return the new value."""
        query = "UPDATE users SET failed_logins = failed_logins + 1, updated_at = %s WHERE id = %s"
        self._execute(query, (datetime.now(), user_id))
        row = self._fetch_one("SELECT failed_logins FROM users WHERE id = %s", (user_id,))
        return row['failed_logins'] if row else 0

    def reset_failed_logins(self, user_id: int):
        """Clear the failed-attempt counter and any lock (called on a successful login)."""
        query = "UPDATE users SET failed_logins = 0, locked_until = NULL, updated_at = %s WHERE id = %s"
        self._execute(query, (datetime.now(), user_id))

    def lock_account(self, user_id: int, locked_until: datetime):
        """Lock the account until ``locked_until`` (auto-unlock side of AUTH_5)."""
        query = "UPDATE users SET locked_until = %s, updated_at = %s WHERE id = %s"
        self._execute(query, (locked_until, datetime.now(), user_id))

    def unlock_account(self, user_id: int):
        """Manually unlock the account and reset the failed-attempt counter
        (superadmin side of AUTH_5 — the two mechanisms both apply, per
        IMPLEMENTATION_PLAN.md §15's resolved AUTH_5 contradiction)."""
        query = "UPDATE users SET failed_logins = 0, locked_until = NULL, updated_at = %s WHERE id = %s"
        self._execute(query, (datetime.now(), user_id))

    def is_locked(self, user_id: int) -> bool:
        """True if the account is currently within its lockout window."""
        row = self._fetch_one("SELECT locked_until FROM users WHERE id = %s", (user_id,))
        return bool(row and row['locked_until'] and row['locked_until'] > datetime.now())

    def row_to_user(self, row: Any) -> User:
        """
        Konwertuj Row → User object

        Args:
            row: SQLite Row object

        Returns:
            User object
        """
        return User(
            id=row["id"],
            email=row["email"],
            password_hash=row["password_hash"],
            full_name=row["full_name"],
            role=row["role"],
            is_active=bool(row["is_active"]),
            last_login=parse_dt(row["last_login"]),
            failed_logins=row["failed_logins"] if "failed_logins" in row.keys() else 0,
            locked_until=parse_dt(row["locked_until"]) if "locked_until" in row.keys() else None,
            worker_id=row["worker_id"] if "worker_id" in row.keys() else None,
            created_at=parse_dt(row["created_at"]),
            updated_at=parse_dt(row["updated_at"])
        )
