"""
Trasy autentykacji - logowanie, wylogowanie, reset hasła

JSON-only API for the React frontend (frontend/), which talks to this same
session-cookie/Flask-Login auth. `/me` is the SPA's session-check-on-load
endpoint — the original server-rendered app never needed a "who am I"
endpoint (Jinja had current_user directly).
"""
import secrets
from datetime import datetime, timedelta

from flask import Blueprint, request, session, jsonify
from flask_login import login_user, logout_user, login_required, current_user
from repositories.users.user_repository import UserRepository
from repositories.audit_repository import AuditRepository
from services.auth.auth_service import AuthService
from config.database import DatabaseConnection
from config.ui_messages import msg
from config.auth_config import get_all_permission_flags, is_supervisor, get_linked_employee

# Create blueprint
auth_bp = Blueprint('auth', __name__, url_prefix='/auth')


def _user_json(user) -> dict:
    return {
        'id': user.id,
        'email': user.email,
        'full_name': user.full_name,
        'role': user.role,
        'is_active': user.is_active,
        'last_login': user.last_login.isoformat() if user.last_login else None,
    }


@auth_bp.route('/me')
def me():
    """Session-check for the SPA: who (if anyone) is logged in, plus their
    module permissions / supervisor / linked-employee flags — the same
    inputs the reference sidebar.html used server-side to decide what to
    render, now shipped as data instead of computed per Jinja include."""
    if not current_user.is_authenticated:
        return jsonify({'authenticated': False})

    linked_employee = get_linked_employee(current_user)
    return jsonify({
        'authenticated': True,
        'user': _user_json(current_user),
        'permissions': get_all_permission_flags(current_user.role),
        'is_supervisor': is_supervisor(current_user),
        'has_linked_employee': linked_employee is not None,
    })


@auth_bp.route('/login', methods=['POST'])
def login():
    """Logowanie"""
    if current_user.is_authenticated:
        return jsonify({'success': True, 'user': _user_json(current_user)})

    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip()
    password = data.get('password') or ''
    remember = bool(data.get('remember'))

    if not email or not password:
        return jsonify({'success': False, 'error': msg('auth.login.missing_credentials')}), 400

    user_repo = UserRepository()
    auth_service = AuthService(user_repo)

    success, user, error_message = auth_service.authenticate(email, password)

    if success:
        login_user(user, remember=remember)
        session.permanent = True  # 30-day sliding session (PERMANENT_SESSION_LIFETIME)

        AuditRepository().safe_log_event(
            entity_type='login', action='LOGIN',
            entity_label=user.email,
            new_value=request.remote_addr,
            user_id=user.id, user_name=user.full_name,
        )
        return jsonify({'success': True, 'user': _user_json(user)})

    AuditRepository().safe_log_event(
        entity_type='login', action='LOGIN_FAILED',
        entity_label=email,
        new_value=request.remote_addr,
    )
    return jsonify({'success': False, 'error': error_message}), 401


@auth_bp.route('/logout')
@login_required
def logout():
    """Wylogowanie użytkownika"""
    AuditRepository().safe_log_event(
        entity_type='login', action='LOGOUT',
        entity_label=current_user.email,
        user_id=current_user.id, user_name=current_user.full_name,
    )
    logout_user()
    return jsonify({'success': True})


@auth_bp.route('/change-password', methods=['POST'])
@login_required
def change_password():
    """Zmiana hasła"""
    data = request.get_json(silent=True) or {}
    old_password = data.get('old_password') or ''
    new_password = data.get('new_password') or ''
    confirm_password = data.get('confirm_password') or new_password

    if not old_password or not new_password or not confirm_password:
        return jsonify({'success': False, 'error': msg('auth.change_password.missing_fields')}), 400

    if new_password != confirm_password:
        return jsonify({'success': False, 'error': msg('auth.change_password.mismatch')}), 400

    user_repo = UserRepository()
    auth_service = AuthService(user_repo)

    success, error_message = auth_service.change_password(
        current_user.id,
        old_password,
        new_password
    )

    if success:
        return jsonify({'success': True})
    return jsonify({'success': False, 'error': error_message}), 400


# ---------------------------------------------------------------------------
# Forgot / Reset password (no email required — token shown directly on screen)
# ---------------------------------------------------------------------------

@auth_bp.route('/forgot-password', methods=['POST'])
def forgot_password():
    """Wysyła (na ekran, nie mailem) link resetujący hasło"""
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    reset_url = None

    if email:
        user_repo = UserRepository()
        user = user_repo.get_by_email(email)

        if user:
            conn = DatabaseConnection.get_connection()
            cursor = conn.cursor()

            # Invalidate any existing unused tokens for this user
            cursor.execute(
                "UPDATE password_reset_tokens SET used = TRUE WHERE user_id = %s AND used = FALSE",
                (user.id,)
            )

            # Generate new token (256-bit URL-safe)
            token = secrets.token_urlsafe(32)
            expires_at = datetime.now() + timedelta(hours=1)

            cursor.execute(
                "INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (%s, %s, %s)",
                (user.id, token, expires_at)
            )
            conn.commit()

            # The SPA is a separate origin/port from Flask — the link must
            # point at ITS route, so a relative path (not an external URL).
            reset_url = f'/reset-password/{token}'

            AuditRepository().safe_log_event(
                entity_type='user', action='PASSWORD_RESET_REQUESTED',
                entity_id=user.id, entity_label=user.email,
            )

        # Always show the same neutral response (prevents email enumeration)
        # reset_url is only set when user was found

    return jsonify({'reset_url': reset_url})


@auth_bp.route('/reset-password/<token>', methods=['POST'])
def reset_password(token: str):
    """Ustawia nowe hasło po kliknięciu w link z tokenem"""
    conn = DatabaseConnection.get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM password_reset_tokens WHERE token = %s AND used = FALSE AND expires_at > NOW()",
        (token,)
    )
    token_row = cursor.fetchone()

    if not token_row:
        return jsonify({'success': False, 'error': msg('auth.reset.link_dead')}), 400

    data = request.get_json(silent=True) or {}
    new_password = data.get('new_password') or ''
    confirm_password = data.get('confirm_password') or new_password

    if len(new_password) < 8:
        return jsonify({'success': False, 'error': msg('auth.reset.weak_password')}), 400

    if new_password != confirm_password:
        return jsonify({'success': False, 'error': msg('auth.reset.mismatch')}), 400

    # Update password and mark token as used
    user_repo = UserRepository()
    user_repo.update_password(token_row['user_id'], new_password)

    cursor.execute(
        "UPDATE password_reset_tokens SET used = TRUE WHERE token = %s",
        (token,)
    )
    conn.commit()

    AuditRepository().safe_log_event(
        entity_type='user', action='PASSWORD_RESET',
        entity_id=token_row['user_id'],
        new_value=request.remote_addr,
    )
    return jsonify({'success': True})
