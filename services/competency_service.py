"""
services/competency_service.py — IMPLEMENTATION_PLAN.md §8.

Zestawia dane z job_skills/worker_skills w widoki porównawcze (gap
analysis — SKL_4/JOB_6) i filtrowanie po lukach kompetencyjnych (SKL_6).
"""
from typing import List, Optional

from exceptions import NotFoundError
from repositories.jobs.job_skill_repository import JobSkillRepository
from repositories.workers.worker_repository import WorkerRepository
from repositories.workers.worker_skill_repository import WorkerSkillRepository


def get_gap_analysis(worker_id: str) -> List[dict]:
    """SKL_4/JOB_6 (worker-scoped): this worker's job's required skills vs.
    their actual ratings. gap = required_rating - current_rating (an
    unassessed skill counts as current_rating=0) — positive means below
    requirement, zero or negative means meeting or exceeding it. Empty list
    when the worker has no job assigned — nothing to compare against."""
    worker = WorkerRepository().get_by_id(worker_id)
    if not worker:
        raise NotFoundError('Pracownik nie znaleziony')

    job_id = worker['job_id']
    if not job_id:
        return []

    requirements = JobSkillRepository().get_by_job(job_id)
    current = {ws['skill_id']: ws['current_rating'] for ws in WorkerSkillRepository().get_by_worker(worker_id)}

    return [
        {
            'skill_id': r['skill_id'],
            'skill_description': r['skill_description'],
            'required_rating': r['required_rating'],
            'current_rating': current.get(r['skill_id']),
            'gap': r['required_rating'] - (current.get(r['skill_id']) or 0),
        }
        for r in requirements
    ]


def get_job_gap_analysis(job_id: str) -> List[dict]:
    """JOB_6 (job-scoped): every worker holding this job, each with their
    own gap-analysis list — reuses get_gap_analysis per worker rather than
    duplicating the comparison logic."""
    workers = WorkerRepository().get_by_job(job_id)
    return [
        {
            'worker_id': w['id'],
            'full_name': f"{w['firstname']} {w['surname']}",
            'is_active': w['fire_date'] is None,
            'gaps': get_gap_analysis(w['id']),
        }
        for w in workers
    ]


def filter_workers_by_skill_gap(skill_id: Optional[str] = None, min_gap: int = 1) -> List[dict]:
    """SKL_6: active workers with a competency gap >= min_gap, optionally
    for one specific skill."""
    return WorkerSkillRepository().filter_by_gap(skill_id=skill_id, min_gap=min_gap)
