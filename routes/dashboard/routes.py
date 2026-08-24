"""
Pulpit i alerty (dashboard) — API. IMPLEMENTATION_PLAN.md §11.

Walidacja i rola-świadome zawężanie dzieją się w services/dashboard_service.py
i services/alert_service.py — trasa zajmuje się wyłącznie kształtem
żądania/odpowiedzi, tak samo jak routes/medical/routes.py i
routes/bhp/routes.py.
"""
import logging

from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

import services.dashboard_service as dashboard_service
from config.auth_config import module_permission_required, role_required
from exceptions import AppError, ValidationError
from repositories.dashboard.alert_threshold_repository import AlertThresholdRepository

dashboard_bp = Blueprint('dashboard', __name__, url_prefix='/dashboard')


def _threshold_json(row) -> dict:
    return {
        'module': row['module'],
        'warning_days': row['warning_days'],
        'critical_days': row['critical_days'],
        'notice_days': row['notice_days'],
        'updated_at': row['updated_at'].isoformat() if row['updated_at'] else None,
    }


def _medical_alert_json(row) -> dict:
    return {
        'id': row['id'],
        'worker_id': row['worker_id'],
        'full_name': f"{row['firstname']} {row['surname']}",
        'description': row['description'],
        'performed_on': row['performed_on'].isoformat() if row['performed_on'] else None,
        'valid_until': row['valid_until'].isoformat() if row['valid_until'] else None,
        'kind': row['kind'],
        'bucket': row['bucket'],
    }


def _bhp_alert_json(row) -> dict:
    return {
        'id': row['id'],
        'worker_id': row['worker_id'],
        'full_name': f"{row['firstname']} {row['surname']}",
        'training_date': row['training_date'].isoformat() if row['training_date'] else None,
        'valid_until': row['valid_until'].isoformat() if row['valid_until'] else None,
        'kind': row['kind'],
        'bucket': row['bucket'],
    }


def _foreigner_doc_alert_json(row) -> dict:
    return {
        'worker_id': row['worker_id'],
        'full_name': f"{row['firstname']} {row['surname']}",
        'document_kind': row['document_kind'],
        'document_validity': row['document_validity'].isoformat() if row['document_validity'] else None,
        'bucket': row['bucket'],
    }


def _orphan_job_json(row) -> dict:
    return {
        'id': row['id'],
        'description': row['description'],
    }


def _upcoming_termination_json(row) -> dict:
    return {
        'worker_id': row['worker_id'],
        'full_name': f"{row['firstname']} {row['surname']}",
        'planned_fire_date': row['planned_fire_date'].isoformat() if row['planned_fire_date'] else None,
        'bucket': row['bucket'],
    }


def _overdue_training_json(row) -> dict:
    return {
        'id': row['id'],
        'description': row['description'],
        'training_date': row['training_date'].isoformat() if row['training_date'] else None,
        'pending_participants': row['pending_participants'],
        'delay_days': row['delay_days'],
        'bucket': row['bucket'],
    }


def _overdue_action_plan_json(row) -> dict:
    return {
        'id': row['id'],
        'description': row['description'],
        'responsible_name': (
            f"{row['responsible_firstname']} {row['responsible_surname']}"
            if row['responsible_firstname'] else None
        ),
        'planned_date': row['planned_date'].isoformat() if row['planned_date'] else None,
        'delay_days': row['delay_days'],
        'bucket': row['bucket'],
    }


def _own_training_json(row) -> dict:
    return {
        'id': row['id'],
        'description': row['description'],
        'training_date': row['training_date'].isoformat() if row['training_date'] else None,
        'completion': row['completion'],
    }


@dashboard_bp.route('/api/summary', methods=['GET'])
@login_required
@module_permission_required('dashboard')
def api_summary():
    """GET /dashboard/api/summary — DSH_1."""
    try:
        return jsonify(dashboard_service.get_summary(current_user))
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_summary (dashboard)')
        raise AppError('Wystąpił błąd serwera')


@dashboard_bp.route('/api/alerts', methods=['GET'])
@login_required
@module_permission_required('dashboard')
def api_alerts():
    """GET /dashboard/api/alerts — DSH_2/3/4, zawężone wg roli
    (services/dashboard_service.py's get_alerts docstring): pełny dostęp
    dostaje trzy panele pracownicze, `trainer` dostaje tylko własne
    szkolenia."""
    try:
        alerts = dashboard_service.get_alerts(current_user)
        if 'own_trainings' in alerts:
            return jsonify({'own_trainings': [_own_training_json(t) for t in alerts['own_trainings']]})
        return jsonify({
            'medical': [_medical_alert_json(r) for r in alerts['medical']],
            'bhp': [_bhp_alert_json(r) for r in alerts['bhp']],
            'foreigner_docs': [_foreigner_doc_alert_json(r) for r in alerts['foreigner_docs']],
            'orphan_jobs': [_orphan_job_json(r) for r in alerts['orphan_jobs']],
            'upcoming_terminations': [_upcoming_termination_json(r) for r in alerts['upcoming_terminations']],
            'overdue_trainings': [_overdue_training_json(r) for r in alerts['overdue_trainings']],
            'overdue_action_plans': [_overdue_action_plan_json(r) for r in alerts['overdue_action_plans']],
        })
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_alerts (dashboard)')
        raise AppError('Wystąpił błąd serwera')


@dashboard_bp.route('/api/alert-thresholds', methods=['GET'])
@login_required
@role_required('superadmin')
def api_get_alert_thresholds():
    """GET /dashboard/api/alert-thresholds — DSH_5, tylko superadmin."""
    try:
        rows = AlertThresholdRepository().get_all()
        return jsonify({'thresholds': [_threshold_json(r) for r in rows]})
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_get_alert_thresholds (dashboard)')
        raise AppError('Wystąpił błąd serwera')


@dashboard_bp.route('/api/alert-thresholds', methods=['PUT'])
@login_required
@role_required('superadmin')
def api_update_alert_thresholds():
    """PUT /dashboard/api/alert-thresholds — DSH_5. Body:
    {"thresholds": [{"module": "medical", "critical_days": 30,
    "warning_days": 60, "notice_days": 90}, ...]} — updates every listed
    module in one request (the admin page edits and saves all three
    modules together, not one at a time)."""
    data = request.get_json() or {}
    items = data.get('thresholds')
    if not isinstance(items, list) or not items:
        raise ValidationError('Oczekiwano listy progów w polu "thresholds"')

    repo = AlertThresholdRepository()
    try:
        for item in items:
            module = item.get('module')
            critical_days = int(item.get('critical_days'))
            warning_days = int(item.get('warning_days'))
            notice_days = int(item.get('notice_days'))
            if not (0 < critical_days < warning_days < notice_days):
                raise ValidationError(
                    f'Progi modułu {module!r} muszą spełniać: critical < warning < notice (liczby dodatnie)'
                )
            if not repo.update(
                module, critical_days=critical_days, warning_days=warning_days,
                notice_days=notice_days, updated_by=current_user.id,
            ):
                raise ValidationError(f'Nieznany moduł progu: {module!r}')
    except (TypeError, ValueError):
        raise ValidationError('Progi muszą być liczbami całkowitymi')
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_update_alert_thresholds (dashboard)')
        raise AppError('Wystąpił błąd serwera')

    return jsonify({'success': True})
