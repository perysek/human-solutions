"""
Minimal 'main' blueprint — root health-check endpoint for the API.

The reference project's real 'main' blueprint (dashboard, appointments,
clients, services, invoices, ...) was not included in this dump — only
auth/users/roles/employees were. This stub just gives `/` something to
answer with: the React frontend (frontend/) owns every real page.
"""
from flask import Blueprint, jsonify

main_bp = Blueprint('main', __name__)


@main_bp.route('/')
def index():
    return jsonify({
        'status': 'ok',
        'message': 'MyWay API server. The frontend runs separately — see frontend/.',
    })
