"""
Publiczne, niezalogowane endpointy — MOBILE_PRESENCE_CONFIRMATION_PLAN.md §4.4.

Ten blueprint nie ma NIGDZIE @login_required, module_permission_required ani
role_required — te dekoratory zakładają current_user
(config/auth_config.py sprawdza current_user.is_authenticated jako pierwsze)
i zwróciłyby 401 każdemu prawowitemu wywołującemu. Token w URL-u JEST
uwierzytelnieniem tutaj — nie current_user, nie sesja.

Każdy endpoint jest ograniczony przez `extensions.limiter` (Flask-Limiter,
klucz = adres IP przez ProxyFix — patrz app.py) — to jedyna naprawdę nowa
powierzchnia nadużyć w tej aplikacji: app.py's CSRF-skip trzyma się tylko
dlatego, że każdy dotychczasowy konsument to zalogowany SPA (patrz komentarz
przy tamtej decyzji), a ten blueprint łamie to założenie.
"""
import logging

from flask import Blueprint, jsonify, request

import services.training_presence_service as training_presence_service
from exceptions import AppError
from extensions import limiter

public_bp = Blueprint('public', __name__, url_prefix='/public')


@public_bp.route('/sign-in/<token>', methods=['GET'])
@limiter.limit('30/minute')
def get_sign_in(token):
    """GET /public/sign-in/<token> — nagłówek szkolenia + lista uczestników
    zawężona do tego jednego tokenu (nic więcej w systemie nie jest
    osiągalne z tego adresu)."""
    try:
        return jsonify(training_presence_service.get_sign_in_roster(token))
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in get_sign_in (public)')
        raise AppError('Wystąpił błąd serwera')


@public_bp.route('/sign-in/<token>/confirm', methods=['POST'])
@limiter.limit('10/minute')
def confirm_sign_in(token):
    """POST /public/sign-in/<token>/confirm — jednorazowe potwierdzenie
    obecności. ip/user-agent wyciągane tutaj (routing layer), nie w
    services/ — ten sam podział co payload/current_user w innych trasach."""
    data = request.get_json() or {}
    try:
        new_id = training_presence_service.confirm_presence(
            token, data,
            ip_address=request.remote_addr,
            user_agent=request.headers.get('User-Agent'),
        )
        return jsonify({'success': True, 'id': new_id}), 201
    except AppError:
        raise
    except Exception:
        logging.exception('Unexpected error in confirm_sign_in (public)')
        raise AppError('Wystąpił błąd serwera')
