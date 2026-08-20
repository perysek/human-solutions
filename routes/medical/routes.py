"""
Zarządzanie badaniami lekarskimi pracowników (medical_exams) — API.
IMPLEMENTATION_PLAN.md §9.

Walidacja i audyt dzieją się w services/medical_service.py i
MedicalExamRepository — trasa zajmuje się wyłącznie kształtem
żądania/odpowiedzi, tak samo jak routes/workers/routes.py.
"""
import logging

from flask import Blueprint, request, jsonify
from flask_login import login_required

from config.auth_config import module_permission_required
from exceptions import AppError, ValidationError
import services.medical_service as medical_service
from services.alert_service import get_expiring_medical

medical_bp = Blueprint('medical', __name__, url_prefix='/medical')


def _exam_json(row) -> dict:
    return {
        'id': row['id'],
        'worker_id': row['worker_id'],
        'description': row['description'],
        'performed_on': row['performed_on'].isoformat() if row['performed_on'] else None,
        'valid_until': row['valid_until'].isoformat() if row['valid_until'] else None,
        'kind': row['kind'],
    }


@medical_bp.route('/api/worker/<worker_id>', methods=['GET'])
@login_required
@module_permission_required('medical')
def api_list_for_worker(worker_id):
    """GET /medical/api/worker/<worker_id> — badania lekarskie pracownika (MED_5)."""
    try:
        rows = medical_service.list_for_worker(worker_id)
        exams = [_exam_json(r) for r in rows]
        return jsonify({'exams': exams, 'count': len(exams)})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_list_for_worker (medical)')
        raise AppError('Wystąpił błąd serwera')


@medical_bp.route('/api/worker/<worker_id>', methods=['POST'])
@login_required
@module_permission_required('medical')
def api_create(worker_id):
    """POST /medical/api/worker/<worker_id> — dodaj badanie lekarskie."""
    data = request.get_json() or {}
    try:
        new_id = medical_service.create_exam(worker_id, data)
        return jsonify({'success': True, 'id': new_id}), 201
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_create (medical)')
        raise AppError('Wystąpił błąd serwera')


@medical_bp.route('/api/<int:exam_id>', methods=['PUT'])
@login_required
@module_permission_required('medical')
def api_update(exam_id):
    """PUT /medical/api/<id> — zaktualizuj badanie lekarskie."""
    data = request.get_json() or {}
    try:
        medical_service.update_exam(exam_id, data)
        return jsonify({'success': True})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_update (medical)')
        raise AppError('Wystąpił błąd serwera')


@medical_bp.route('/api/<int:exam_id>', methods=['DELETE'])
@login_required
@module_permission_required('medical')
def api_delete(exam_id):
    """DELETE /medical/api/<id> — usuń badanie lekarskie."""
    try:
        medical_service.delete_exam(exam_id)
        return jsonify({'success': True})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_delete (medical)')
        raise AppError('Wystąpił błąd serwera')


@medical_bp.route('/api/expiring', methods=['GET'])
@login_required
@module_permission_required('medical')
def api_expiring():
    """GET /medical/api/expiring?days=30 — globalny raport wygasających
    badań (MED_6), każde otagowane kubełkiem critical/warning/notice."""
    try:
        days = int(request.args.get('days', 30))
        rows = get_expiring_medical(days)
        return jsonify({
            'exams': [
                {
                    **_exam_json(r),
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
        logging.exception('Unexpected error in api_expiring (medical)')
        raise AppError('Wystąpił błąd serwera')
