"""
Application error hierarchy.

Routes raise these instead of building jsonify(...) error responses by hand;
app.py registers one error handler (AppError -> JSON) that turns any of them
into a consistent {'success': False, 'error': str(e)} response with the
right HTTP status. Referenced throughout routes/users/routes.py,
routes/roles/routes.py, repositories/base_repository.py.
"""


class AppError(Exception):
    """Base application error. Carries the HTTP status the error handler should use."""

    status_code = 500

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message

    def __str__(self) -> str:
        return self.message


class ValidationError(AppError):
    """Bad input — missing/malformed fields, failed business-rule checks."""

    status_code = 400


class PermissionDeniedError(AppError):
    """Authenticated, but not allowed to perform this action."""

    status_code = 403


class NotFoundError(AppError):
    """Referenced entity does not exist."""

    status_code = 404


class ConflictError(AppError):
    """Request conflicts with existing state (e.g. duplicate unique field)."""

    status_code = 409


class DatabaseConnectionError(AppError):
    """The database is unreachable or the connection died mid-request."""

    status_code = 503
