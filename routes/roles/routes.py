"""
Zarządzanie rolami i uprawnieniami — strony i API
Dostępne tylko dla: superadmin
"""
import logging

from flask import Blueprint, request, jsonify
from flask_login import login_required

from config.auth_config import role_required
from exceptions import AppError, ValidationError, NotFoundError, ConflictError
from repositories.roles.role_repository import RoleRepository

roles_bp = Blueprint('roles', __name__, url_prefix='/system/roles')


def _role_repo() -> RoleRepository:
    return RoleRepository()


# ─── API Endpoints ────────────────────────────────────────────────────────────

@roles_bp.route('/api', methods=['GET'])
@login_required
@role_required('superadmin')
def api_list():
    """GET /system/roles/api — lista ról"""
    try:
        role_repo = _role_repo()
        rows = role_repo.get_all()
        roles_data = []
        for row in rows:
            perms = role_repo.get_permissions(row['id'])
            # Flatten for the list view: just has_access booleans per module
            perms_flat = {m: v['has_access'] for m, v in perms.items()}
            roles_data.append({
                'id': row['id'],
                'name': row['name'],
                'display_name': row['display_name'],
                'is_protected': bool(row['is_protected']),
                'access_count': row['access_count'],
                'permissions': perms_flat,
                'permissions_detail': perms,
            })
        return jsonify({'roles': roles_data, 'count': len(roles_data)})
    except AppError:
        raise
    except Exception as e:
        logging.exception('Unexpected error in api_list (roles)')
        raise AppError('Wystapil blad serwera')


@roles_bp.route('/api', methods=['POST'])
@login_required
@role_required('superadmin')
def api_create():
    """POST /system/roles/api — utwórz nową rolę"""
    data = request.get_json() or {}
    name = (data.get('name') or '').strip().lower().replace(' ', '_')
    display_name = (data.get('display_name') or '').strip()
    permissions = data.get('permissions') or {}

    if not name or not display_name:
        raise ValidationError('Nazwa i wyswietlana nazwa sa wymagane')

    role_repo = _role_repo()
    if role_repo.get_by_name(name):
        raise ConflictError(f'Rola o nazwie "{name}" juz istnieje')

    try:
        role_id = role_repo.create(name, display_name)
        role_repo.set_permissions(role_id, permissions)
        return jsonify({'success': True, 'role_id': role_id}), 201
    except AppError:
        raise
    except Exception as e:
        logging.exception('Unexpected error in api_create (roles)')
        raise AppError('Wystapil blad serwera')


@roles_bp.route('/api/<int:role_id>', methods=['PUT'])
@login_required
@role_required('superadmin')
def api_update(role_id):
    """PUT /system/roles/api/<id> — zaktualizuj display_name i uprawnienia"""
    role_repo = _role_repo()
    role = role_repo.get_by_id(role_id)
    if not role:
        raise NotFoundError('Rola nie znaleziona')

    data = request.get_json() or {}
    display_name = (data.get('display_name') or '').strip()
    permissions = data.get('permissions') or {}

    if not display_name:
        raise ValidationError('Wyswietlana nazwa jest wymagana')

    try:
        role_repo.update(role_id, display_name)
        role_repo.set_permissions(role_id, permissions)
        return jsonify({'success': True})
    except AppError:
        raise
    except Exception as e:
        logging.exception('Unexpected error in api_update (roles)')
        raise AppError('Wystapil blad serwera')


@roles_bp.route('/api/<int:role_id>', methods=['DELETE'])
@login_required
@role_required('superadmin')
def api_delete(role_id):
    """DELETE /system/roles/api/<id> — usuń niechronioną rolę"""
    try:
        role_repo = _role_repo()
        role = role_repo.get_by_id(role_id)
        if not role:
            raise NotFoundError('Rola nie znaleziona')

        if bool(role['is_protected']):
            from exceptions import PermissionDeniedError
            raise PermissionDeniedError('Nie mozna usunac chronionej roli systemowej')

        deleted = role_repo.delete(role_id)
        if deleted:
            return jsonify({'success': True})
        raise AppError('Nie udalo sie usunac roli')
    except AppError:
        raise
    except Exception as e:
        logging.exception('Unexpected error in api_delete (roles)')
        raise AppError('Wystapil blad serwera')
