"""
Flask application factory.

Missing from the reference dump (routes/, repositories/, config/, database/
were reference material only — this file and services/ were absent). This
rebuilds the wiring: env loading, the DB connection pool, Flask-Login,
CSRF, blueprint registration, and JSON error handling, so the existing
repositories/routes actually run as a backend for frontend/ (React).
"""
import os
from pathlib import Path

from dotenv import load_dotenv

# Must run before anything below reads os.environ (DATABASE_URL, SECRET_KEY).
_BASE_DIR = Path(__file__).parent
load_dotenv(_BASE_DIR / '.env')
load_dotenv(_BASE_DIR / '.env.local', override=True)

from flask import Flask, jsonify
from flask_login import LoginManager

from config.database import DatabaseConnection, initialize_pool, assert_schema_current
from exceptions import AppError
from repositories.users.user_repository import UserRepository


def create_app() -> Flask:
    app = Flask(__name__)

    secret_key = os.environ.get('SECRET_KEY', '')
    if not secret_key or len(secret_key) < 32:
        raise RuntimeError(
            "SECRET_KEY must be set to a high-entropy value (>= 32 chars). "
            'Generate with: python -c "import secrets; print(secrets.token_hex(32))" '
            "and put it in .env.local."
        )
    app.config['SECRET_KEY'] = secret_key
    app.config['SESSION_COOKIE_SECURE'] = os.environ.get('SESSION_COOKIE_SECURE', 'false').lower() == 'true'
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
    # 30-day sliding session, matches `session.permanent = True` in routes/auth/routes.py's login().
    app.config['PERMANENT_SESSION_LIFETIME'] = 60 * 60 * 24 * 30

    initialize_pool()

    @app.teardown_appcontext
    def _close_db(_exc):
        DatabaseConnection.close_connection()

    with app.app_context():
        assert_schema_current()

    # --- Flask-Login ---
    login_manager = LoginManager()
    login_manager.init_app(app)

    @login_manager.user_loader
    def load_user(user_id):
        repo = UserRepository()
        row = repo.get_by_id(int(user_id))
        return repo.row_to_user(row) if row else None

    @login_manager.unauthorized_handler
    def unauthorized():
        # Every consumer of this API is the SPA (fetch/XHR) — always JSON, never a redirect.
        return jsonify({'success': False, 'error': 'Wymagane logowanie.'}), 401

    # --- Idle-timeout guard (AUTH_4) ---
    from config.session_guard import register_idle_timeout
    register_idle_timeout(app)

    # --- CSRF ---
    # No CSRF middleware here: every consumer is the SPA (frontend/), making
    # same-origin fetch/XHR calls with SESSION_COOKIE_SAMESITE='Lax' and an
    # X-Requested-With header — there's no browser form ever posting to this
    # API, so no cross-site form-submit vector to guard against. See
    # BACKEND_SETUP.md for the production follow-up (double-submit-cookie
    # CSRF) before this serves real traffic from an untrusted origin.

    # --- Blueprints ---
    # employees_bp (salon domain) retired here — IMPLEMENTATION_PLAN.md §5.4.
    from routes.auth.routes import auth_bp
    from routes.users.routes import users_bp
    from routes.roles.routes import roles_bp
    from routes.jobs.routes import jobs_bp
    from routes.skills.routes import skills_bp
    from routes.workers.routes import workers_bp
    from routes.medical.routes import medical_bp
    from routes.bhp.routes import bhp_bp
    from routes.main.routes import main_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(roles_bp)
    app.register_blueprint(jobs_bp)
    app.register_blueprint(skills_bp)
    app.register_blueprint(workers_bp)
    app.register_blueprint(medical_bp)
    app.register_blueprint(bhp_bp)
    app.register_blueprint(main_bp)

    # Singleton some routes reach via current_app.audit_repo (routes/users, routes/roles).
    from repositories.audit_repository import AuditRepository
    app.audit_repo = AuditRepository()

    # --- Error handling ---
    @app.errorhandler(AppError)
    def handle_app_error(err):
        return jsonify({'success': False, 'error': str(err)}), err.status_code

    @app.errorhandler(404)
    def handle_404(_err):
        return jsonify({'success': False, 'error': 'Nie znaleziono.'}), 404

    @app.errorhandler(500)
    def handle_500(_err):
        return jsonify({'success': False, 'error': 'Wystąpił błąd serwera.'}), 500

    return app
