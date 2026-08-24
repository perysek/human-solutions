"""
Zarządzanie szkoleniami BHP pracowników (bhp_trainings) — API.
IMPLEMENTATION_PLAN.md §9.

Struktura identyczna do routes/medical/routes.py — patrz jej docstring
dla podziału odpowiedzialności względem services/bhp_service.py.
"""
import logging

from flask import Blueprint, jsonify, request
from flask_login import login_required

import services.bhp_service as bhp_service
from config.auth_config import module_permission_required
from exceptions import AppError, ValidationError
from services.alert_service import get_expiring_bhp

bhp_bp = Blueprint('bhp', __name__, url_prefix='/bhp')


def _training_json(row) -> dict:
    return {
        'id': row['id'],
        'worker_id': row['worker_id'],
        'training_date': row['training_date'].isoformat() if row['training_date'] else None,
        'valid_until': row['valid_until'].isoformat() if row['valid_until'] else None,
        'kind': row['kind'],
    }


@bhp_bp.route('/api/worker/<worker_id>', methods=['GET'])
@login_required
@module_permission_required('bhp')
def api_list_for_worker(worker_id):
    """GET /bhp/api/worker/<worker_id> — szkolenia BHP pracownika (BHP_4)."""
    try:
        rows = bhp_service.list_for_worker(worker_id)
        trainings = [_training_json(r) for r in rows]
        return jsonify({'trainings': trainings, 'count': len(trainings)})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_list_for_worker (bhp)')
        raise AppError('Wystąpił błąd serwera')


@bhp_bp.route('/api/worker/<worker_id>', methods=['POST'])
@login_required
@module_permission_required('bhp')
def api_create(worker_id):
    """POST /bhp/api/worker/<worker_id> — dodaj szkolenie BHP."""
    data = request.get_json() or {}
    try:
        new_id = bhp_service.create_training(worker_id, data)
        return jsonify({'success': True, 'id': new_id}), 201
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_create (bhp)')
        raise AppError('Wystąpił błąd serwera')


@bhp_bp.route('/api/<int:training_id>', methods=['PUT'])
@login_required
@module_permission_required('bhp')
def api_update(training_id):
    """PUT /bhp/api/<id> — zaktualizuj szkolenie BHP."""
    data = request.get_json() or {}
    try:
        bhp_service.update_training(training_id, data)
        return jsonify({'success': True})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_update (bhp)')
        raise AppError('Wystąpił błąd serwera')


@bhp_bp.route('/api/<int:training_id>', methods=['DELETE'])
@login_required
@module_permission_required('bhp')
def api_delete(training_id):
    """DELETE /bhp/api/<id> — usuń szkolenie BHP."""
    try:
        bhp_service.delete_training(training_id)
        return jsonify({'success': True})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_delete (bhp)')
        raise AppError('Wystąpił błąd serwera')


@bhp_bp.route('/api/expiring', methods=['GET'])
@login_required
@module_permission_required('bhp')
def api_expiring():
    """GET /bhp/api/expiring?days=30 — globalny raport wygasających
    szkoleń (BHP_5), każde otagowane kubełkiem critical/warning/notice."""
    try:
        days = int(request.args.get('days', 30))
        rows = get_expiring_bhp(days)
        return jsonify({
            'trainings': [
                {
                    **_training_json(r),
                    'full_name': f"{r['firstname']} {r['surname']}",
                    'bucket': r['bucket'],
                }
                for r in rows
            ],
            'count': len(rows),
        })
    except AppError:
        raise
    except (TypeError, ValueError):
        raise ValidationError('Nieprawidłowy parametr days')
    except Exception:
        logging.exception('Unexpected error in api_expiring (bhp)')
        raise AppError('Wystąpił błąd serwera')
