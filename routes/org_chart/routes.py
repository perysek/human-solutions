"""
Wykres organizacyjny + rewizje struktury (ręczne, od migracji d6d10b667838) —
API. ORG_CHART_PROPOSAL.md §3d.

Dwa poziomy dostępu na tym samym blueprincie: sam wykres (drzewo + numer
najnowszej rewizji), lista oczekujących zmian, i tworzenie nowej rewizji są
gated na 'jobs' — tworzenie/przeglądanie rewizji to naturalne rozszerzenie
uprawnienia do edycji działów/stanowisk, nie osobna kategoria (decyzja
użytkownika przy planowaniu tej funkcji). Pełna, tylko-do-odczytu historia
zmian (`/revisions`) zostaje gated na 'audit' — to wciąż ta sama kategoria
danych co przyszły viewer dziennika audytu (Faza 7).
"""
import logging

from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

import services.org_chart_service as org_chart_service
from config.auth_config import module_permission_required
from exceptions import AppError
from repositories.org_chart.org_chart_revision_repository import OrgChartRevisionRepository

org_chart_bp = Blueprint('org_chart', __name__, url_prefix='/org-chart')


@org_chart_bp.route('/api/tree', methods=['GET'])
@login_required
@module_permission_required('jobs')
def api_tree():
    """GET /org-chart/api/tree — pełne drzewo (Dyrektor -> kierownicy
    działów -> poddziały -> pracownicy), wyliczane przy każdym odczycie."""
    try:
        return jsonify(org_chart_service.get_org_chart_tree())
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_tree (org_chart)')
        raise AppError('Wystąpił błąd serwera')


@org_chart_bp.route('/api/revisions/latest', methods=['GET'])
@login_required
@module_permission_required('jobs')
def api_latest_revision():
    """GET /org-chart/api/revisions/latest — zasila badge 'Rev. 8 · data' na
    stronie wykresu. Gated tak samo jak sam wykres (nie 'audit') — "na jakiej
    rewizji jestem" jest częścią oglądania wykresu, nie wrażliwą częścią;
    pełna historia poniżej już tak."""
    try:
        latest = OrgChartRevisionRepository().get_latest()
        return jsonify(org_chart_service.humanize_revision(latest) if latest else None)
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_latest_revision (org_chart)')
        raise AppError('Wystąpił błąd serwera')


@org_chart_bp.route('/api/pending-changes', methods=['GET'])
@login_required
@module_permission_required('jobs')
def api_pending_changes():
    """GET /org-chart/api/pending-changes — zmiany struktury od ostatniej
    rewizji, jeszcze nią nie objęte. NewRevisionModal.tsx pokazuje to jako
    listę do przejrzenia przed 'Utwórz rewizję'. Gated na 'jobs' (patrz
    docstring modułu) — ten sam poziom dostępu co edycja działów/stanowisk."""
    try:
        return jsonify(org_chart_service.get_pending_changes())
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_pending_changes (org_chart)')
        raise AppError('Wystąpił błąd serwera')


@org_chart_bp.route('/api/revisions', methods=['POST'])
@login_required
@module_permission_required('jobs')
def api_create_revision():
    """POST /org-chart/api/revisions — zatwierdza WSZYSTKIE aktualnie
    oczekujące zmiany jako jedną nową rewizję (NewRevisionModal's 'Utwórz
    rewizję'). 422 ValidationError, jeśli nic nie jest oczekujące."""
    try:
        revision = org_chart_service.create_revision(current_user.id, current_user.full_name)
        return jsonify(revision), 201
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_create_revision (org_chart)')
        raise AppError('Wystąpił błąd serwera')


@org_chart_bp.route('/api/revisions', methods=['GET'])
@login_required
@module_permission_required('audit')
def api_list_revisions():
    """GET /org-chart/api/revisions?page=&page_size= — pełna, paginowana
    historia zmian struktury (najnowsze najpierw), bez affordance'ów
    edycji/usuwania — to log tylko do odczytu, tak jak przyszły
    audit_log viewer."""
    try:
        page = max(int(request.args.get('page', 1)), 1)
        page_size = min(max(int(request.args.get('page_size', 25)), 1), 200)
        rows, total = OrgChartRevisionRepository().list_paginated(page=page, page_size=page_size)
        return jsonify({
            'revisions': [org_chart_service.humanize_revision(r) for r in rows],
            'count': total,
            'page': page,
            'page_size': page_size,
        })
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in api_list_revisions (org_chart)')
        raise AppError('Wystąpił błąd serwera')
