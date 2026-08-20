"""
Modele danych (dataclasses)
"""
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional
from flask_login import UserMixin

@dataclass
class User(UserMixin):
    """Model użytkownika (konto logowania)"""
    email: str
    password_hash: str
    full_name: str
    role: str = 'viewer'  # 'superadmin', 'hr_manager', 'trainer', 'viewer' — see config/auth_config.py
    is_active: bool = True
    id: Optional[int] = None
    last_login: Optional[datetime] = None
    failed_logins: int = 0
    locked_until: Optional[datetime] = None
    worker_id: Optional[str] = None
    created_at: Optional[datetime] = field(default_factory=datetime.now)
    updated_at: Optional[datetime] = field(default_factory=datetime.now)

    def get_id(self):
        """Required by Flask-Login"""
        return str(self.id)

    @property
    def is_authenticated(self):
        """Required by Flask-Login"""
        return True

    @property
    def is_anonymous(self):
        """Required by Flask-Login"""
        return False

    def has_role(self, *roles):
        """Check if user has any of the specified roles"""
        return self.role in roles

# The Staamp HR domain's models (Worker, Job, Skill, MedicalExam, BhpTraining,
# Training, ...) land in Phases 1-5 of IMPLEMENTATION_PLAN.md. The salon
# domain's Employee/FormaZatrudnienia/Absence* dataclasses that used to live
# here were removed in Phase 0 (§5.4) alongside their consuming
# repositories/routes (repositories/employees/, repositories/absences/,
# routes/employees/) — see git history for the removed code if a reference is
# ever needed.