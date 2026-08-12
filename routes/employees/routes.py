"""
Zarządzanie pracownikami — JSON API
Dostępne tylko dla: superuser, admin (delete: superuser only)

New blueprint. The reference dump included repositories/employees/
(employee_repository.py, forma_zatrudnienia_repository.py) but no route
layer — unlike users/roles, which shipped complete. Modeled directly on
routes/users/routes.py: same decorators, same AppError/ValidationError/
NotFoundError usage, same JSON response shape. EmployeeRepository already
audits create/update/delete itself via AuditableMixin, so routes here don't
duplicate that call the way routes/users/routes.py has to.
"""
import logging
from datetime import date

from flask import Blueprint, request, jsonify
from flask_login import login_required

from config.auth_config import role_required
from exceptions import AppError, ValidationError, NotFoundError
from repositories.employees.employee_repository import EmployeeRepository
from database.models import Employee

employees_bp = Blueprint('employees', __name__, url_prefix='/employees')

ALLOWED_ROLES = ['superuser', 'admin']


def _repo() -> EmployeeRepository:
    return EmployeeRepository()


def _row_to_dict(row) -> dict:
    return {
        'id': row['id'],
        'first_name': row['first_name'],
        'last_name': row['last_name'],
        'full_name': f"{row['first_name']} {row['last_name']}".strip(),
        'phone': row['phone'],
        'email': row['email'],
        'position': row['position'],
        'employment_status': row['employment_status'],
        'hire_date': row['hire_date'].isoformat() if row['hire_date'] else None,
        'termination_date': row['termination_date'].isoformat() if row['termination_date'] else None,
        'base_salary': float(row['base_salary']) if row['base_salary'] is not None else None,
        'commission_rate': float(row['commission_rate']) if row['commission_rate'] is not None else None,
        'notes': row['notes'],
        'is_active': bool(row['is_active']),
        'user_id': row['user_id'],
        'created_at': row['created_at'].isoformat() if row['created_at'] else None,
        'updated_at': row['updated_at'].isoformat() if row['updated_at'] else None,
    }


def _parse_date(value):
    if not value:
        return None
    return date.fromisoformat(value)


def _employee_from_payload(data: dict) -> Employee:
    first_name = (data.get('first_name') or '').strip()
    last_name = (data.get('last_name') or '').strip()
    if not first_name or not last_name:
        raise ValidationError('Imię i nazwisko są wymagane')

    return Employee(
        first_name=first_name,
        last_name=last_name,
        phone=(data.get('phone') or '').strip() or None,
        email=(data.get('email') or '').strip() or None,
        position=(data.get('position') or '').strip() or None,
        employment_status=data.get('employment_status') or 'active',
        hire_date=_parse_date(data.get('hire_date')),
        termination_date=_parse_date(data.get('termination_date')),
        base_salary=float(data['base_salary']) if data.get('base_salary') not in (None, '') else None,
        commission_rate=float(data['commission_rate']) if data.get('commission_rate') not in (None, '') else None,
        notes=(data.get('notes') or '').strip() or None,
        is_active=bool(data.get('is_active', True)),
    )


@employees_bp.route('/api', methods=['GET'])
@login_required
@role_required(*ALLOWED_ROLES)
def api_list():
    """GET /employees/api — lista aktywnych (nie usuniętych) pracowników.

    active_only=True: `delete()` is a soft-delete (is_active=FALSE) — a
    deleted row must disappear from the default list, the same way it would
    for any other soft-deleted entity. employment_status='terminated' is a
    separate, purely informational status (an employee can be terminated
    and still is_active=TRUE) and stays visible with its own badge.
    """
    try:
        rows = _repo().get_all(active_only=True)
        data = [_row_to_dict(r) for r in rows]
        return jsonify({'employees': data, 'count': len(data)})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_list (employees)')
        raise AppError('Wystąpił błąd serwera')


@employees_bp.route('/api/<int:employee_id>', methods=['GET'])
@login_required
@role_required(*ALLOWED_ROLES)
def api_get(employee_id):
    """GET /employees/api/<id> — szczegóły pracownika"""
    try:
        row = _repo().get_by_id(employee_id)
        if not row:
            raise NotFoundError('Pracownik nie znaleziony')
        return jsonify(_row_to_dict(row))
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_get (employees)')
        raise AppError('Wystąpił błąd serwera')


@employees_bp.route('/api', methods=['POST'])
@login_required
@role_required(*ALLOWED_ROLES)
def api_create():
    """POST /employees/api — utwórz nowego pracownika"""
    data = request.get_json() or {}
    try:
        employee = _employee_from_payload(data)
        employee_id = _repo().create(employee)
        return jsonify({'success': True, 'employee_id': employee_id}), 201
    except ValueError as e:
        raise ValidationError(str(e))
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_create (employees)')
        raise AppError('Wystąpił błąd serwera')


@employees_bp.route('/api/<int:employee_id>', methods=['PUT'])
@login_required
@role_required(*ALLOWED_ROLES)
def api_update(employee_id):
    """PUT /employees/api/<id> — zaktualizuj pracownika"""
    row = _repo().get_by_id(employee_id)
    if not row:
        raise NotFoundError('Pracownik nie znaleziony')

    data = request.get_json() or {}
    try:
        employee = _employee_from_payload(data)
        changed = _repo().update(employee_id, employee)
        if not changed:
            raise NotFoundError('Pracownik nie znaleziony')
        return jsonify({'success': True})
    except ValueError as e:
        raise ValidationError(str(e))
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_update (employees)')
        raise AppError('Wystąpił błąd serwera')


@employees_bp.route('/api/<int:employee_id>', methods=['DELETE'])
@login_required
@role_required('superuser')
def api_delete(employee_id):
    """DELETE /employees/api/<id> — usuń (dezaktywuj) pracownika. Superuser only."""
    try:
        row = _repo().get_by_id(employee_id)
        if not row:
            raise NotFoundError('Pracownik nie znaleziony')
        deleted = _repo().delete(employee_id)  # soft delete (is_active = FALSE)
        if not deleted:
            raise AppError('Nie udało się usunąć pracownika')
        return jsonify({'success': True})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_delete (employees)')
        raise AppError('Wystąpił błąd serwera')
