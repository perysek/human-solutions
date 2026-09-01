"""
Wykres organizacyjny + historia rewizji struktury — API. ORG_CHART_PROPOSAL.md §3d.

Dwa poziomy dostępu na tym samym blueprincie: sam wykres (drzewo + numer
najnowszej rewizji) jest gated na 'jobs' — to ten sam odczyt co Działy
firmy/Stanowiska, bez żadnych nowych danych osobowych ponad to, co
`/departments`/`/jobs` już pokazują. Pełna historia zmian (`/revisions`) jest
gated na 'audit' — surowy log strukturalny to ta sama kategoria danych co
przyszły viewer dziennika audytu (Faza 7), więc dziedziczy jego uprawnienia
zamiast siać nowy seed w role_permissions.
"""
import logging

from flask import Blueprint, jsonify, request
from flask_login import login_required

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
