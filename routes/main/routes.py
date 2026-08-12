"""
Minimal 'main' blueprint.

The reference project's real 'main' blueprint (dashboard, appointments,
clients, services, invoices, ...) was not included in this dump — only
auth/users/roles/absence* were. Several existing, unmodified pieces of
config/auth_config.py reference `url_for('main.dashboard')` as their
permission-denied fallback target (`role_required`'s redirect,
`module_permission_required`'s `_deny()` referrer fallback). Without SOME
'main.dashboard' endpoint registered, those calls raise a BuildError instead
of denying cleanly.

This stub exists solely to give that url_for(...) somewhere real to resolve
to. It is never a page a user is meant to land on — the React frontend
(frontend/) owns every real page — so it returns a plain JSON 403 rather
than HTML.
"""
from flask import Blueprint, jsonify

main_bp = Blueprint('main', __name__)


@main_bp.route('/')
def index():
    return jsonify({
        'status': 'ok',
        'message': 'MyWay API server. The frontend runs separately — see frontend/.',
    })


@main_bp.route('/dashboard', methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
def dashboard():
    # role_required's permission-denied redirect is a 302, and some HTTP
    # clients (incl. PowerShell's Invoke-RestMethod) re-issue the SAME
    # method against the Location header rather than downgrading to GET —
    # so a denied DELETE/PUT/POST lands here with that verb. Accepting all
    # of them keeps the response a clean JSON 403 instead of a 405 that
    # would obscure the real "you don't have permission" reason.
    return jsonify({'success': False, 'error': 'Brak uprawnień lub nieprawidłowe żądanie.'}), 403
