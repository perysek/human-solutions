"""
Modele danych (dataclasses)
"""
from dataclasses import dataclass, field
from datetime import datetime, date, time
from decimal import Decimal
from typing import Optional
from flask_login import UserMixin

@dataclass
class User(UserMixin):
    """Model użytkownika (konto logowania)"""
    email: str
    password_hash: str
    full_name: str
    role: str = 'receptionist'  # 'superuser', 'admin', 'receptionist', 'stylist', 'accountant'
    is_active: bool = True
    id: Optional[int] = None
    last_login: Optional[datetime] = None
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


@dataclass
class Employee:
    """Model pracownika salonu"""
    first_name: str
    last_name: str
    user_id: Optional[int] = None  # Optional link to users table
    forma_zatrudnienia_id: Optional[int] = None  # FK to formy_zatrudnienia
    phone: Optional[str] = None
    email: Optional[str] = None
    position: Optional[str] = None  # 'Stylist', 'Receptionist', 'Manager'
    employment_status: str = 'active'  # 'active', 'on_leave', 'terminated'
    hire_date: Optional[date] = None
    termination_date: Optional[date] = None
    base_salary: Optional[float] = None  # Monthly base salary
    commission_rate: Optional[float] = None  # Percentage (e.g., 40.00 for 40%)
    employer_cost_rate: float = 0.22  # Polish ZUS/taxes rate (e.g. 0.22 = 22%)
    skills: Optional[str] = None  # JSON string: '{"Hair Color": 5, "Balayage": 4}'
    specializations: Optional[str] = None  # JSON string: '["Bridal", "Extensions"]'
    work_schedule: Optional[str] = None  # JSON string: '{"mon": "9-17", "tue": "9-17"}'
    max_appointments_per_day: int = 8
    notes: Optional[str] = None
    photo_path: Optional[str] = None
    is_active: bool = True
    id: Optional[int] = None
    created_at: Optional[datetime] = field(default_factory=datetime.now)
    updated_at: Optional[datetime] = field(default_factory=datetime.now)

    @property
    def full_name(self) -> str:
        """Pełne imię i nazwisko pracownika"""
        return f"{self.first_name} {self.last_name}"

    def get_skills_dict(self) -> dict:
        """Pobierz umiejętności jako słownik (parsowanie JSON)"""
        if not self.skills:
            return {}
        try:
            import json
            return json.loads(self.skills)
        except (json.JSONDecodeError, TypeError):
            return {}

    def get_specializations_list(self) -> list:
        """Pobierz specjalizacje jako listę (parsowanie JSON)"""
        if not self.specializations:
            return []
        try:
            import json
            return json.loads(self.specializations)
        except (json.JSONDecodeError, TypeError):
            return []

    def get_work_schedule_dict(self) -> dict:
        """Pobierz grafik jako słownik (parsowanie JSON)"""
        if not self.work_schedule:
            return {}
        try:
            import json
            return json.loads(self.work_schedule)
        except (json.JSONDecodeError, TypeError):
            return {}


@dataclass
class FormaZatrudnienia:
    """Model formy zatrudnienia (np. UoP, B2B, Umowa zlecenie)"""
    nazwa: str
    uwagi: Optional[str] = None
    min_salary_required: bool = False  # Czy wymagane minimalne wynagrodzenie
    granted_salary: bool = False       # Czy wynagrodzenie gwarantowane
    commision_included: bool = False   # Czy prowizja wliczona
    id: Optional[int] = None
    created_at: Optional[datetime] = field(default_factory=datetime.now)
    updated_at: Optional[datetime] = field(default_factory=datetime.now)


# ── Absence management models ─────────────────────────────────────────────────

@dataclass
class AbsenceCategory:
    """Kategoria nieobecności (urlop, L4, wyjście prywatne, ...).

    absence_full_day=True  → wymaga date_from + date_to
    absence_full_day=False → wymaga date (= date_from) + time_from + time_to
    """
    name: str
    description: Optional[str] = None
    absence_full_day: bool = True
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
    id: Optional[int] = None
    created_at: Optional[datetime] = field(default_factory=datetime.now)
    updated_at: Optional[datetime] = field(default_factory=datetime.now)
    # Balance tracking fields
    is_tracked: bool = False
    count_period: str = 'yearly'          # 'yearly' | 'monthly' | 'rolling'
    resets_at: Optional[int] = 1          # day-of-year (yearly) or day-of-month (monthly)
    rolling_days: Optional[int] = None    # rolling window length in days
    warning_threshold_pct: float = 0.80
    default_max_value: float = 0.0


@dataclass
class EmployeeAbsenceLimit:
    """Indywidualny limit nieobecności pracownika dla danej kategorii."""
    employee_id: int
    category_id: int
    max_value: float
    notes: Optional[str] = None
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
    created_by: Optional[int] = None
    id: Optional[int] = None
    created_at: Optional[datetime] = field(default_factory=datetime.now)
    updated_at: Optional[datetime] = field(default_factory=datetime.now)


@dataclass
class AbsenceBalanceAdjustment:
    """Manualna korekta salda nieobecności (dodatnia lub ujemna)."""
    employee_id: int
    category_id: int
    delta_value: float
    reason: str
    period_label: Optional[str] = None
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
    created_by: Optional[int] = None
    id: Optional[int] = None
    created_at: Optional[datetime] = field(default_factory=datetime.now)
    updated_at: Optional[datetime] = field(default_factory=datetime.now)

# below class was to manage the employee hierarchy in the company, but was not optimal and not effective in previous project.
# TODO-CLAUDE: create a class (or more than one class that will be a model to manage the company complete organigram (employees herarchy, levels, teams, management, supervisor hierarchy, substitiutes definition, job descriptions, skill matrixes for departments etc.
@dataclass
class EmployeeSupervisor:
    """Powiązanie pracownik → przełożony (relacja M:M)."""
    employee_id: int
    supervisor_employee_id: int
    created_at: Optional[datetime] = field(default_factory=datetime.now)


@dataclass
class EmployeeAbsence:
    """Wniosek lub ręczna rejestracja nieobecności pracownika.

    source='request' → złożony przez pracownika, wymaga zatwierdzenia
    source='manual'  → wprowadzony ręcznie przez przełożonego (auto-approved)

    Dla nieobecności całodziennych: time_from=None, time_to=None
    Dla slotów czasowych:           time_from/time_to ustawione, date_to = date_from
    """
    employee_id: int
    category_id: int
    date_from: date
    date_to: date
    time_from: Optional[time] = None
    time_to: Optional[time] = None
    approver_id: Optional[int] = None
    status: str = 'pending'           # pending | approved | rejected | cancelled
    rejection_reason: Optional[str] = None
    notes: Optional[str] = None
    source: str = 'request'           # request | manual
    requested_at: Optional[datetime] = field(default_factory=datetime.now)
    responded_at: Optional[datetime] = None
    created_by: Optional[int] = None  # users.id
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
    id: Optional[int] = None
    created_at: Optional[datetime] = field(default_factory=datetime.now)
    updated_at: Optional[datetime] = field(default_factory=datetime.now)