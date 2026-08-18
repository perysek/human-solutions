"""
Konfiguracja autentykacji i autoryzacji
Role-based access control (RBAC) configuration
"""
from functools import wraps
from flask import request, jsonify
from flask_login import current_user
from config.ui_messages import msg

# HTTP methods that mutate state. A role flagged read_only for a module may reach
# view (GET) routes but must be blocked from any of these on that module.
MUTATING_METHODS = frozenset({'POST', 'PUT', 'PATCH', 'DELETE'})


def _deny(msg_key: str, **fmt):
    """Uniform permission denial: JSON 403. Every caller is the SPA (frontend/),
    never a browser form post, so there's no HTML fallback to render."""
    return jsonify({'success': False, 'error': msg(msg_key, **fmt)}), 403

# Role hierarchy (higher number = more permissions).
# Staamp HR domain (IMPLEMENTATION_PLAN.md §5.1) — replaces the salon's
# superuser/admin/receptionist/stylist/accountant hierarchy.
ROLE_HIERARCHY = {
    'superadmin': 4,
    'hr_manager': 3,
    'trainer': 2,
    'viewer': 1,
}

# Module permissions - which roles can access which modules.
# This is the DB-unavailable fallback only — the real, authoritative grants
# (including read_only/own_data, which this static map cannot express) live
# in the roles/role_permissions tables, seeded by
# alembic/versions/c2d3e4f5a6b7_seed_staamp_rbac.py. Keep this dict's has-any-
# access shape in sync with that seed so a DB outage degrades to the same
# broad strokes instead of a different one.
MODULE_PERMISSIONS = {
    'workers': ['superadmin', 'hr_manager'],
    'jobs': ['superadmin', 'hr_manager'],
    'medical': ['superadmin', 'hr_manager'],
    'bhp': ['superadmin', 'hr_manager'],
    'skills': ['superadmin', 'hr_manager'],
    'trainings': ['superadmin', 'hr_manager', 'trainer', 'viewer'],
    'dashboard': ['superadmin', 'hr_manager', 'trainer'],
    'audit': ['superadmin', 'hr_manager'],
    'admin': ['superadmin'],
}

def role_required(*roles):
    """
    Decorator to require specific roles for a route

    Usage:
        @role_required('hr_manager', 'superadmin')
        def admin_only_view():
            pass
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if not current_user.is_authenticated:
                return jsonify({'success': False, 'error': msg('auth.guard.login_required')}), 401

            if current_user.role not in roles:
                return _deny('auth.permission.role_denied')

            return f(*args, **kwargs)
        return decorated_function
    return decorator


def module_permission_required(*module_names):
    """
    Decorator sprawdzający uprawnienia do modułu — dynamicznie z DB.
    Accepts one or more module names (OR logic — access to ANY grants entry).
    Fallback do MODULE_PERMISSIONS jeśli tabela roles jeszcze nie istnieje.
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if not current_user.is_authenticated:
                return jsonify({'success': False, 'error': msg('auth.guard.login_required')}), 401

            # Resolve access AND write-capability across the route's module list.
            # has_access = user can reach ANY listed module (OR logic, unchanged).
            # writable   = at least one accessible module is NOT read_only, i.e. the
            #              user may perform mutating requests through this route.
            has_access = False
            writable = False
            try:
                from repositories.roles.role_repository import RoleRepository
                role_repo = RoleRepository()
                for mod in module_names:
                    flags = role_repo.get_permission_flags(current_user.role, mod)
                    if flags['has_access']:
                        has_access = True
                        if not flags['read_only']:
                            writable = True
            except Exception:
                # DB unavailable → fall back to the static map (full access, no
                # read_only concept there, so any access implies write).
                for mod in module_names:
                    if current_user.role in MODULE_PERMISSIONS.get(mod, []):
                        has_access = True
                        writable = True

            if not has_access:
                return _deny('auth.permission.module_denied', module=module_names[0])

            # read_only enforcement: block state-changing methods for a role whose
            # only grant(s) to this route are read_only. GET/HEAD/OPTIONS pass — the
            # role can still view. (Form-serving GET routes stay reachable; the
            # submit they POST to is what gets stopped here.)
            if request.method in MUTATING_METHODS and not writable:
                return _deny('auth.permission.read_only', module=module_names[0])

            return f(*args, **kwargs)
        return decorated_function
    return decorator


def can_access_module(user_role: str, module_name: str) -> bool:
    """
    Check if a user role can access a specific module

    Args:
        user_role: User's role (e.g., 'admin')
        module_name: Module name (e.g., 'clients')

    Returns:
        True if user has access, False otherwise
    """
    allowed_roles = MODULE_PERMISSIONS.get(module_name, [])
    return user_role in allowed_roles


def get_user_modules(user_role: str) -> list:
    """
    Get list of modules a user can access

    Args:
        user_role: User's role

    Returns:
        List of module names
    """
    accessible_modules = []
    for module, allowed_roles in MODULE_PERMISSIONS.items():
        if user_role in allowed_roles:
            accessible_modules.append(module)
    return accessible_modules


def get_permission_flags(role_name: str, module_name: str) -> dict:
    """
    Zwraca pełne flagi uprawnień {has_access, read_only, own_data} dla roli+modułu.
    Używane przez dekoratory i helpery wymuszające ograniczenia read_only/own_data.
    """
    try:
        from repositories.roles.role_repository import RoleRepository
        return RoleRepository().get_permission_flags(role_name, module_name)
    except Exception:
        has_access = role_name in MODULE_PERMISSIONS.get(module_name, [])
        return {'has_access': has_access, 'read_only': False, 'own_data': False}


def is_read_only(role_name: str, module_name: str) -> bool:
    """True jeśli rola ma dostęp do modułu tylko do odczytu."""
    flags = get_permission_flags(role_name, module_name)
    return flags['has_access'] and flags['read_only']


def is_own_data_only(role_name: str, module_name: str) -> bool:
    """True jeśli rola może widzieć tylko własne dane w module."""
    flags = get_permission_flags(role_name, module_name)
    return flags['has_access'] and flags['own_data']


def get_user_module_permissions(role_name: str) -> dict:
    """
    Pobierz dict {module: bool} dla roli użytkownika.
    Używane przez context processor w app.py.
    Fallback do statycznego MODULE_PERMISSIONS.
    """
    try:
        from repositories.roles.role_repository import RoleRepository
        role_repo = RoleRepository()
        return role_repo.get_user_module_permissions(role_name)
    except Exception:
        # Fallback: build from static config
        return {
            module: role_name in allowed_roles
            for module, allowed_roles in MODULE_PERMISSIONS.items()
        }


def get_all_permission_flags(role_name: str) -> dict:
    """Zwraca {module: {has_access, read_only, own_data}} dla całej roli w jednym
    zapytaniu. Używane przez context processor, aby wystawić do szablonów zarówno
    dostęp (user_permissions) jak i prawo zapisu (user_write_permissions).
    Fallback do statycznego MODULE_PERMISSIONS (bez read_only/own_data).
    """
    try:
        from repositories.roles.role_repository import RoleRepository
        return RoleRepository().get_all_flags(role_name)
    except Exception:
        return {
            module: {
                'has_access': role_name in allowed_roles,
                'read_only': False,
                'own_data': False,
            }
            for module, allowed_roles in MODULE_PERMISSIONS.items()
        }
