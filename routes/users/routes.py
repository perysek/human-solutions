"""
Zarządzanie użytkownikami — strony i API
Dostępne tylko dla: superadmin

Deliberately a literal role_required('superadmin') gate, not a module-based
one (see IMPLEMENTATION_PLAN.md §5.5) — account administration is a hard
boundary that must never become delegable via the roles/permission-matrix UI
by accident, unlike every other module in this app.
"""
import logging
from datetime import datetime
from typing import Optional

from flask import Blueprint, current_app, jsonify, request
from flask_login import current_user, login_required

from config.auth_config import role_required
from exceptions import AppError, ConflictError, NotFoundError, ValidationError
from repositories.roles.role_repository import RoleRepository
from repositories.users.user_repository import UserRepository
from repositories.workers.worker_repository import WorkerRepository

users_bp = Blueprint('users', __name__, url_prefix='/system/users')


def _user_repo() -> UserRepository:
    return UserRepository()


def _role_repo() -> RoleRepository:
    return RoleRepository()


def _user_json(row) -> dict:
    locked_until = row.get('locked_until')
    worker_firstname = row.get('worker_firstname')
    return {
        'id': row['id'],
        'email': row['email'],
        'full_name': row['full_name'],
        'role': row['role'],
        'is_active': bool(row['is_active']),
        'last_login': row['last_login'].isoformat() if row['last_login'] else None,
        'created_at': row['created_at'].isoformat() if row['created_at'] else None,
        'failed_logins': row['failed_logins'],
        'is_locked': bool(locked_until and locked_until > datetime.now()),
        'locked_until': locked_until.isoformat() if locked_until else None,
        # Only present on rows from UserRepository.list_all/get_by_id (both
        # now LEFT JOIN workers) — see UserRepository._JOIN_COLUMNS.
        'worker_id': row.get('worker_id'),
        'worker_name': f"{worker_firstname} {row.get('worker_surname')}" if worker_firstname else None,
    }


def _parse_worker_id(data: dict) -> Optional[str]:
    """'' / missing -> None (unlinked). Raises ValidationError/ConflictError
    if the given id doesn't resolve to a worker, or already belongs to a
    different account — idx_users_worker_id_unique is the hard backstop,
    this is just the readable error message in front of it."""
    raw = data.get('worker_id')
    worker_id = raw.strip() if isinstance(raw, str) else None
    if not worker_id:
        return None
    if not WorkerRepository().get_by_id(worker_id):
        raise ValidationError('Wybrany pracownik nie istnieje')
    return worker_id


def _check_worker_not_taken(worker_id: Optional[str], *, editing_user_id: Optional[int] = None) -> None:
    if not worker_id:
        return
    existing = _user_repo().get_by_worker_id(worker_id)
    if existing and existing.id != editing_user_id:
        raise ConflictError(f'Ten pracownik jest już przypisany do konta {existing.email}')


# ─── API Endpoints ────────────────────────────────────────────────────────────

@users_bp.route('/api/form-options', methods=['GET'])
@login_required
@role_required('superadmin')
def api_form_options():
    """GET /system/users/api/form-options — role + pracownicy dla formularzy create/edit."""
    try:
        roles = _role_repo().get_all()
        workers = WorkerRepository().list_for_user_link()
        return jsonify({
            'roles': [{'id': r['id'], 'name': r['name'], 'display_name': r['display_name']} for r in roles],
            'workers': [
                {
                    'id': w['id'],
                    'full_name': f"{w['firstname']} {w['surname']}",
                    'is_active': w['fire_date'] is None,
                    'linked_user_id': w['linked_user_id'],
                    'linked_user_name': w['linked_user_full_name'],
                }
                for w in workers
            ],
        })
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_form_options (users)')
        raise AppError('Wystapil blad serwera')


@users_bp.route('/api/<int:user_id>', methods=['GET'])
@login_required
@role_required('superadmin')
def api_get(user_id):
    """GET /system/users/api/<id> — szczegóły użytkownika."""
    try:
        user_repo = _user_repo()
        row = user_repo.get_by_id(user_id)
        if not row:
            raise NotFoundError('Uzytkownik nie znaleziony')
        return jsonify(_user_json(row))
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_get (users)')
        raise AppError('Wystapil blad serwera')


@users_bp.route('/api', methods=['GET'])
@login_required
@role_required('superadmin')
def api_list():
    """GET /system/users/api — lista wszystkich użytkowników"""
    try:
        user_repo = _user_repo()
        rows = user_repo.list_all()
        users_data = [_user_json(row) for row in rows]
        return jsonify({'users': users_data, 'count': len(users_data)})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_list (users)')
        raise AppError('Wystapil blad serwera')


@users_bp.route('/api', methods=['POST'])
@login_required
@role_required('superadmin')
def api_create():
    """POST /system/users/api — utwórz nowego użytkownika"""
    data = request.get_json() or {}

    email = (data.get('email') or '').strip()
    full_name = (data.get('full_name') or '').strip()
    password = data.get('password') or ''
    role = (data.get('role') or '').strip()
    is_active = bool(data.get('is_active', True))

    if not email or not full_name or not password or not role:
        raise ValidationError('Email, imie, haslo i rola sa wymagane')

    if len(password) < 8:
        raise ValidationError('Haslo musi miec co najmniej 8 znakow')

    user_repo = _user_repo()

    if user_repo.get_by_email(email):
        raise ConflictError(f'Uzytkownik z adresem {email} juz istnieje')

    worker_id = _parse_worker_id(data)
    _check_worker_not_taken(worker_id)

    try:
        user_id = user_repo.create_user(email=email, password=password,
                                        full_name=full_name, role=role, worker_id=worker_id)
        if not is_active:
            user_repo.deactivate(user_id)

        current_app.audit_repo.safe_log_event(
            entity_type='user', action='CREATE',
            entity_id=user_id, entity_label=email,
            new_value=role,
            user_id=current_user.id, user_name=current_user.full_name,
        )

        return jsonify({'success': True, 'user_id': user_id}), 201
    except ValueError as e:
        raise ValidationError(str(e))
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_create (users)')
        raise AppError('Wystapil blad serwera')


@users_bp.route('/api/<int:user_id>', methods=['PUT'])
@login_required
@role_required('superadmin')
def api_update(user_id):
    """PUT /system/users/api/<id> — zaktualizuj użytkownika"""
    user_repo = _user_repo()
    row = user_repo.get_by_id(user_id)
    if not row:
        raise NotFoundError('Uzytkownik nie znaleziony')

    data = request.get_json() or {}
    email = (data.get('email') or '').strip()
    full_name = (data.get('full_name') or '').strip()
    role = (data.get('role') or '').strip()
    is_active = bool(data.get('is_active', True))
    new_password = data.get('new_password') or ''

    # Password-only update (from the separate password change form)
    if new_password and not email and not full_name and not role:
        if len(new_password) < 8:
            raise ValidationError('Nowe haslo musi miec co najmniej 8 znakow')
        try:
            user_repo.update_password(user_id, new_password)
            return jsonify({'success': True})
        except AppError:
            raise
        except Exception:
            logging.exception('Unexpected error in api_update password (users)')
            raise AppError('Wystapil blad serwera')

    if not email or not full_name or not role:
        raise ValidationError('Email, imie i rola sa wymagane')

    existing_by_email = user_repo.get_by_email(email)
    if existing_by_email and existing_by_email.id != user_id:
        raise ConflictError(f'Email {email} jest juz zajety')

    if new_password and len(new_password) < 8:
        raise ValidationError('Nowe haslo musi miec co najmniej 8 znakow')

    worker_id = _parse_worker_id(data)
    _check_worker_not_taken(worker_id, editing_user_id=user_id)

    try:
        user_repo.update_user(user_id, email, full_name, role, is_active, worker_id=worker_id)

        if new_password:
            user_repo.update_password(user_id, new_password)

        current_app.audit_repo.safe_log_event(
            entity_type='user', action='UPDATE',
            entity_id=user_id, entity_label=email,
            user_id=current_user.id, user_name=current_user.full_name,
        )

        return jsonify({'success': True})
    except ValueError as e:
        raise ValidationError(str(e))
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_update (users)')
        raise AppError('Wystapil blad serwera')


@users_bp.route('/api/<int:user_id>', methods=['DELETE'])
@login_required
@role_required('superadmin')
def api_delete(user_id):
    """DELETE /system/users/api/<id> — usuń użytkownika."""
    if user_id == current_user.id:
        raise ValidationError('Nie możesz usunąć własnego konta')

    user_repo = _user_repo()
    row = user_repo.get_by_id(user_id)
    if not row:
        raise NotFoundError('Uzytkownik nie znaleziony')

    try:
        deleted = user_repo.delete_user(user_id)
        if not deleted:
            raise NotFoundError('Uzytkownik nie znaleziony')
        current_app.audit_repo.safe_log_event(
            entity_type='user', action='DELETE',
            entity_id=user_id, entity_label=row['email'],
            user_id=current_user.id, user_name=current_user.full_name,
        )
        return jsonify({'success': True})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_delete (users)')
        raise AppError('Wystapil blad serwera')


@users_bp.route('/api/<int:user_id>/toggle-active', methods=['PUT'])
@login_required
@role_required('superadmin')
def api_toggle_active(user_id):
    """PUT /system/users/api/<id>/toggle-active — przełącz aktywność konta"""
    try:
        user_repo = _user_repo()
        row = user_repo.get_by_id(user_id)
        if not row:
            raise NotFoundError('Uzytkownik nie znaleziony')

        if row['is_active']:
            user_repo.deactivate(user_id)
            new_state = False
        else:
            user_repo.activate(user_id)
            new_state = True

        return jsonify({'success': True, 'is_active': new_state})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_toggle_active (users)')
        raise AppError('Wystapil blad serwera')


@users_bp.route('/api/<int:user_id>/unlock', methods=['PUT'])
@login_required
@role_required('superadmin')
def api_unlock(user_id):
    """PUT /system/users/api/<id>/unlock — ręczne odblokowanie konta (AUTH_5).

    Uzupełnia automatyczne odblokowanie po LOCKOUT_MINUTES — oba mechanizmy
    obowiązują jednocześnie (IMPLEMENTATION_PLAN.md §15).
    """
    try:
        user_repo = _user_repo()
        row = user_repo.get_by_id(user_id)
        if not row:
            raise NotFoundError('Uzytkownik nie znaleziony')

        user_repo.unlock_account(user_id)
        current_app.audit_repo.safe_log_event(
            entity_type='user', action='ACCOUNT_UNLOCKED',
            entity_id=user_id, entity_label=row['email'],
            user_id=current_user.id, user_name=current_user.full_name,
        )
        return jsonify({'success': True})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_unlock (users)')
        raise AppError('Wystapil blad serwera')
