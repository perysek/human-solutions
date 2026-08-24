"""
Dev-only mock data seeder for the Staamp HR domain.

Fills every table the current app actually reads/writes: jobs, skills,
job_skills, workers (+ birth_data/worker_nationality/foreigner_data),
worker_skills, worker_skill_remarks, medical_exams, bhp_trainings,
trainings (+ training_job/training_skills/training_participants), and
action_plans.

Deliberately does NOT touch the legacy pre-pivot salon tables (employees,
appointments, clients, services, invoices, absence_*, sms_*, income_records,
invoices, sellers, ...) — those predate the Staamp HR pivot (see
IMPLEMENTATION_PLAN.md) and nothing in routes/ or frontend/ reads them
today; seeding them would just be noise.

Jobs/skills are looked up by id and skipped if they already exist (so the
existing DYR/KIER_JAK/2001/2002 rows from earlier phases are extended, not
duplicated) and job_skills merges into whatever requirements a job already
has. Everything else (workers, medical exams, bhp trainings, trainings,
action plans) is always inserted fresh, so this script refuses to run a
second time — guarded by a worker-count threshold — unless --force is
passed (which will duplicate the dataset; only pass it if you actually
want more).

Usage:
    python scripts/seed_mock_data.py [--force]
"""
import os
import random
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

_BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(_BASE_DIR / '.env')
load_dotenv(_BASE_DIR / '.env.local', override=True)

if os.environ.get('FLASK_ENV') == 'production':
    raise SystemExit('Refusing to run the mock data seeder with FLASK_ENV=production.')

import services.worker_service as worker_service
from app import create_app
from repositories.bhp.bhp_training_repository import BhpTrainingRepository
from repositories.jobs.job_repository import JobRepository
from repositories.jobs.job_skill_repository import JobSkillRepository
from repositories.medical.medical_exam_repository import MedicalExamRepository
from repositories.skills.skill_repository import SkillRepository
from repositories.trainings.training_job_repository import TrainingJobRepository
from repositories.trainings.training_participant_repository import TrainingParticipantRepository
from repositories.trainings.training_repository import TrainingRepository
from repositories.trainings.training_skill_repository import TrainingSkillRepository
from repositories.trainings.training_trainer_repository import TrainingTrainerRepository
from repositories.workers.action_plan_repository import ActionPlanRepository
from repositories.workers.worker_repository import WorkerRepository
from repositories.workers.worker_skill_remark_repository import WorkerSkillRemarkRepository
from repositories.workers.worker_skill_repository import WorkerSkillRepository

random.seed(42)  # reproducible dataset across runs
TODAY = date.today()

# ── Dictionaries ────────────────────────────────────────────────────────

SKILLS = [
    ('2003', 'Obsługa wózka widłowego'),
    ('2004', 'Spawanie MIG/MAG'),
    ('2005', 'Obsługa obrabiarek CNC'),
    ('2006', 'Zarządzanie zespołem'),
    ('2007', 'Analiza danych produkcyjnych'),
    ('2008', 'Pierwsza pomoc przedmedyczna'),
    ('2009', 'Obsługa systemu ERP'),
    ('2010', 'Kontrola jakości i metrologia'),
    ('2011', 'Prawo jazdy kat. B'),
    ('2012', 'Język angielski (poziom B2)'),
]

JOBS = [
    ('BRYGADZISTA', 'Brygadzista produkcji'),
    ('OPERATOR_CNC', 'Operator CNC'),
    ('SPAWACZ', 'Spawacz'),
    ('MAGAZYNIER', 'Magazynier'),
    ('KIEROWNIK_PROD', 'Kierownik Produkcji'),
    ('SPECJALISTA_HR', 'Specjalista ds. Kadr'),
    ('LOGISTYK', 'Specjalista ds. Logistyki'),
    ('KONTROLER_JAKOSCI', 'Kontroler Jakości'),
]

# job_id -> [(skill_id, required_rating), ...] — merged into whatever the
# job already requires, not a replacement.
JOB_SKILLS = {
    'DYR': [('2006', 3), ('2012', 2)],
    'KIER_JAK': [('2010', 2), ('2007', 2)],
    'BRYGADZISTA': [('2006', 2), ('2003', 1)],
    'OPERATOR_CNC': [('2005', 3), ('2010', 1)],
    'SPAWACZ': [('2004', 3), ('2008', 1)],
    'MAGAZYNIER': [('2003', 2), ('2011', 1)],
    'KIEROWNIK_PROD': [('2006', 3), ('2007', 2), ('2009', 2)],
    'SPECJALISTA_HR': [('2009', 2), ('2012', 2)],
    'LOGISTYK': [('2009', 2), ('2011', 2), ('2012', 1)],
    'KONTROLER_JAKOSCI': [('2010', 3), ('2001', 2)],
}

# Two-level org chart: staff jobs report to a manager job; manager jobs
# report to DYR. DYR/KIER_JAK already exist from earlier phases.
REPORTS_TO_JOB = {
    'KIER_JAK': 'DYR',
    'KIEROWNIK_PROD': 'DYR',
    'SPECJALISTA_HR': 'DYR',
    'LOGISTYK': 'DYR',
    'BRYGADZISTA': 'KIEROWNIK_PROD',
    'OPERATOR_CNC': 'KIEROWNIK_PROD',
    'SPAWACZ': 'KIEROWNIK_PROD',
    'MAGAZYNIER': 'LOGISTYK',
    'KONTROLER_JAKOSCI': 'KIER_JAK',
}

# (job_id, headcount) — the first hire into a manager job becomes that
# job's anchor for REPORTS_TO_JOB lookups; order matters (managers first).
HEADCOUNT = [
    ('KIEROWNIK_PROD', 1),
    ('SPECJALISTA_HR', 2),
    ('LOGISTYK', 3),
    ('BRYGADZISTA', 4),
    ('OPERATOR_CNC', 5),
    ('SPAWACZ', 4),
    ('MAGAZYNIER', 4),
    ('KONTROLER_JAKOSCI', 6),
]

FIRST_NAMES_M = ['Adam', 'Marcin', 'Tomasz', 'Krzysztof', 'Michał', 'Paweł', 'Rafał', 'Grzegorz',
                 'Łukasz', 'Dariusz', 'Bartosz', 'Wojciech', 'Sebastian', 'Mateusz', 'Jakub']
FIRST_NAMES_F = ['Anna', 'Katarzyna', 'Magdalena', 'Agnieszka', 'Ewa', 'Barbara', 'Monika', 'Joanna',
                  'Elżbieta', 'Beata', 'Natalia', 'Karolina', 'Justyna', 'Aleksandra', 'Dorota']
SURNAMES = ['Nowak', 'Kowalski', 'Wiśniewski', 'Wójcik', 'Kowalczyk', 'Kamiński', 'Lewandowski',
            'Zieliński', 'Szymański', 'Woźniak', 'Dąbrowski', 'Kozłowski', 'Jankowski', 'Mazur',
            'Kwiatkowski', 'Krawczyk', 'Piotrowski', 'Grabowski', 'Pawłowski', 'Michalski',
            'Adamczyk', 'Dudek', 'Zając', 'Wieczorek', 'Jabłoński', 'Król', 'Majewski', 'Olszewski']
CITIES = ['Warszawa', 'Kraków', 'Poznań', 'Wrocław', 'Łódź', 'Gdańsk', 'Lublin', 'Radom', 'Kielce', 'Rzeszów']


def _rand_date(days_from_today_min: int, days_from_today_max: int) -> date:
    """Both bounds are offsets from TODAY (negative = past). Clamps order
    so callers can pass them in either sequence."""
    lo, hi = sorted((days_from_today_min, days_from_today_max))
    return TODAY + timedelta(days=random.randint(lo, hi))


def _rand_name():
    if random.random() < 0.5:
        return random.choice(FIRST_NAMES_M), random.choice(SURNAMES), 'Male'
    return random.choice(FIRST_NAMES_F), random.choice(SURNAMES), 'Female'


def seed_dictionaries():
    print('Seeding skills/jobs dictionaries...')
    skill_repo = SkillRepository()
    for skill_id, description in SKILLS:
        if not skill_repo.get_by_id(skill_id):
            skill_repo.create(skill_id, description)

    job_repo = JobRepository()
    for job_id, description in JOBS:
        if not job_repo.get_by_id(job_id):
            job_repo.create(job_id, description)

    job_skill_repo = JobSkillRepository()
    for job_id, requirements in JOB_SKILLS.items():
        existing = {r['skill_id']: r['required_rating'] for r in job_skill_repo.get_by_job(job_id)}
        merged = dict(existing)
        merged.update({skill_id: rating for skill_id, rating in requirements})
        job_skill_repo.replace_requirements(
            job_id, [{'skill_id': s, 'required_rating': r} for s, r in merged.items()],
        )
    print(f'  {len(SKILLS)} skills, {len(JOBS)} jobs, {len(JOB_SKILLS)} job_skills sets ready.')


def seed_workers():
    print('Seeding workers...')
    worker_repo = WorkerRepository()

    # Anchor the two management jobs that already exist from earlier phases.
    job_workers = {'DYR': [], 'KIER_JAK': []}
    for job_id in job_workers:
        rows = worker_repo._fetch_all(
            "SELECT id FROM workers WHERE job_id = %s AND fire_date IS NULL ORDER BY id LIMIT 1", (job_id,),
        )
        if rows:
            job_workers[job_id].append(rows[0]['id'])

    all_new_ids = []
    boss_of = {}  # worker_id -> boss_id, for action_plans' responsible_id lookup later
    idx = 0
    for job_id, count in HEADCOUNT:
        boss_job = REPORTS_TO_JOB.get(job_id)
        for _ in range(count):
            idx += 1
            firstname, surname, gender = _rand_name()
            hire_date = _rand_date(-365 * 8, -30)
            boss_id = None
            if boss_job and job_workers.get(boss_job):
                boss_id = random.choice(job_workers[boss_job])

            payload = {
                'firstname': firstname, 'surname': surname, 'job_id': job_id,
                'boss_id': boss_id, 'gender': gender, 'hire_date': hire_date.isoformat(),
                'birth_date': _rand_date(-365 * 45, -365 * 22).isoformat() if random.random() < 0.8 else None,
                'birth_place': random.choice(CITIES) if random.random() < 0.8 else None,
                'nationalities': ['Polska'],
            }

            # ~10% of the new hires are foreigners — exercises WRK_4/WRK_5/WRK_10.
            if random.random() < 0.1:
                other_nat = random.choice(['Ukraina', 'Białoruś', 'Gruzja'])
                payload['nationalities'] = [other_nat]
                payload['foreigner'] = {
                    'document_kind': random.choice(['Karta pobytu', 'Wiza krajowa']),
                    'document_validity': _rand_date(-10, 75).isoformat(),
                    'employment_basis': 'Zezwolenie na pracę',
                    'employment_basis_validity': _rand_date(20, 200).isoformat(),
                }

            worker_id = worker_service.create_worker(payload)

            # ~13% inactive, to exercise the active/inactive filter.
            # WorkerRepository has no update-with-arbitrary-fire_date method
            # (deactivate() only sets CURRENT_DATE) — a direct UPDATE is the
            # only way to backdate it for a realistic "left N months ago" row.
            if random.random() < 0.13:
                days_employed = max((TODAY - hire_date).days, 2)
                fire_date = hire_date + timedelta(days=random.randint(1, days_employed - 1))
                worker_repo._execute(
                    "UPDATE workers SET fire_date = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s",
                    (fire_date, worker_id),
                )

            all_new_ids.append(worker_id)
            boss_of[worker_id] = boss_id
            job_workers.setdefault(job_id, []).append(worker_id)

    print(f'  {idx} workers created across {len(HEADCOUNT)} jobs.')
    return job_workers, boss_of


def seed_worker_skills(job_workers: dict):
    print('Seeding worker_skills (ratings + gaps) and remarks...')
    ws_repo = WorkerSkillRepository()
    remark_repo = WorkerSkillRemarkRepository()
    all_skill_ids = [s for s, _ in SKILLS] + ['2001', '2002']

    gaps = []  # (worker_id, skill_id, gap) for action_plans to draw from
    remark_targets = []  # (worker_skill_id, worker_id)
    rated_count = 0

    for job_id, worker_ids in job_workers.items():
        requirements = JOB_SKILLS.get(job_id, [])
        for worker_id in worker_ids:
            rated_skills = set()
            for skill_id, required_rating in requirements:
                roll = random.random()
                if roll < 0.15:
                    current_rating = None  # unassessed — counts as gap = required_rating
                elif roll < 0.45:
                    current_rating = max(1, required_rating - random.choice([1, 2]))
                else:
                    current_rating = min(3, required_rating + random.choice([0, 0, 1]))

                last_update = None if random.random() < 0.1 else _rand_date(-500, -1)
                new_id = ws_repo.set_rating(worker_id, skill_id, current_rating, last_update)
                rated_skills.add(skill_id)
                rated_count += 1

                gap = required_rating - (current_rating or 0)
                if gap > 0:
                    gaps.append((worker_id, skill_id, gap))
                if random.random() < 0.08:
                    remark_targets.append((new_id, worker_id))

            # A couple of extra, non-required ratings per worker — populates
            # the general "Oceny umiejętności" list beyond just the gap table.
            extra_pool = [s for s in all_skill_ids if s not in rated_skills]
            for skill_id in random.sample(extra_pool, k=min(2, len(extra_pool))):
                ws_repo.set_rating(worker_id, skill_id, random.randint(1, 3), _rand_date(-400, -1))
                rated_count += 1

    remark_texts = [
        'Wymaga dodatkowego przeszkolenia w tym zakresie.',
        'Bardzo dobra ocena przełożonego, kandydat do awansu.',
        'Ocena obniżona po incydencie na hali produkcyjnej.',
        'Uzupełniono po rozmowie okresowej.',
        'Do weryfikacji przy kolejnej ocenie rocznej.',
    ]
    for worker_skill_id, worker_id in remark_targets[:6]:
        remark_repo.create(worker_skill_id, worker_id, random.choice(remark_texts))

    print(f'  {rated_count} worker_skills rows, {len(gaps)} with a gap, {min(6, len(remark_targets))} remarks.')
    return gaps


def seed_medical_and_bhp(job_workers: dict):
    print('Seeding medical_exams and bhp_trainings...')
    medical_repo = MedicalExamRepository()
    bhp_repo = BhpTrainingRepository()

    # Rotate through 4 windows so every bucket the report pages' 30/60/90-day
    # selector cares about actually has rows: already expired, critical
    # (<=30d), warning (<=60d), notice (<=90d), and comfortably safe.
    windows = [(-20, -5), (5, 25), (35, 55), (65, 85), (150, 400)]
    all_worker_ids = [wid for ids in job_workers.values() for wid in ids]
    sample = random.sample(all_worker_ids, k=min(22, len(all_worker_ids)))

    med_count = bhp_count = 0
    for i, worker_id in enumerate(sample):
        lo, hi = windows[i % len(windows)]
        valid_until = _rand_date(lo, hi)
        performed_on = valid_until - timedelta(days=365 * 2)
        medical_repo.create(
            worker_id, 'Badanie okresowe stanowiskowe', performed_on, valid_until,
            random.choice(['Preliminary', 'Periodic']),
        )
        med_count += 1

        lo2, hi2 = windows[(i + 2) % len(windows)]
        valid_until2 = _rand_date(lo2, hi2)
        training_date2 = valid_until2 - timedelta(days=365)
        bhp_repo.create(worker_id, training_date2, valid_until2, random.choice(['Initial', 'Periodic', 'Control']))
        bhp_count += 1

    print(f'  {med_count} medical_exams, {bhp_count} bhp_trainings.')


TRAININGS = [
    dict(description='Szkolenie BHP wstępne', jobs=[], skills=['2008'], completion=100),
    dict(
        description='Audyt wewnętrzny ISO 9001/IATF — warsztat',
        jobs=['KIER_JAK', 'KONTROLER_JAKOSCI'], skills=['2001'], completion=100,
    ),
    dict(
        description='Uprawnienia UDT — wózki widłowe',
        jobs=['MAGAZYNIER', 'BRYGADZISTA'], skills=['2003'], completion=80,
    ),
    dict(description='Kurs spawania MIG/MAG — certyfikacja', jobs=['SPAWACZ'], skills=['2004'], completion=100),
    dict(
        description='Warsztat zarządzania zespołem',
        jobs=['KIEROWNIK_PROD', 'BRYGADZISTA', 'DYR'], skills=['2006'], completion=60,
    ),
    dict(
        description='Obsługa systemu ERP — moduł magazynowy',
        jobs=['LOGISTYK', 'MAGAZYNIER', 'SPECJALISTA_HR'], skills=['2009'], completion=40,
    ),
    dict(description='Pierwsza pomoc przedmedyczna', jobs=[], skills=['2008'], completion=100),
]


def seed_trainings(job_workers: dict):
    print('Seeding trainings, links, and participants...')
    training_repo = TrainingRepository()
    job_link_repo = TrainingJobRepository()
    skill_link_repo = TrainingSkillRepository()
    trainer_link_repo = TrainingTrainerRepository()
    participant_repo = TrainingParticipantRepository()

    manager_ids = job_workers.get('KIEROWNIK_PROD', []) + job_workers.get('KIER_JAK', []) + job_workers.get('DYR', [])
    all_worker_ids = [wid for ids in job_workers.values() for wid in ids]

    training_count = participant_count = 0
    for spec in TRAININGS:
        training_date = _rand_date(-400, -5)
        training_id = training_repo.create(
            spec['description'], 'Szkolenie zorganizowane w ramach planu rozwoju kompetencji.',
            training_date, spec['completion'], None, None,
        )
        training_count += 1
        if spec['jobs']:
            # replace_links takes {job_id, is_mandatory, sequence_order} dicts
            # (migration n3o4p5q6r7s8) — seed data has no opinion on either,
            # so every link comes in as mandatory/unordered (the columns'
            # own defaults, just spelled out explicitly here).
            job_link_repo.replace_links(
                training_id, [{'job_id': j, 'is_mandatory': True, 'sequence_order': None} for j in spec['jobs']]
            )
        skill_link_repo.replace_links(training_id, spec['skills'])

        candidates = [wid for j in spec['jobs'] for wid in job_workers.get(j, [])] if spec['jobs'] else all_worker_ids
        candidates = list(dict.fromkeys(candidates))  # dedupe, keep order
        participants = random.sample(candidates, k=min(6, len(candidates))) if candidates else []

        # Task 2 — trainer is training-level now (training_trainers), not
        # per-participant: one trainer picked per training instead of once
        # per enrollee.
        trainers = [m for m in manager_ids if m not in participants] or manager_ids
        if trainers:
            trainer_link_repo.replace_links(training_id, [random.choice(trainers)])

        for worker_id in participants:
            start_date = training_date
            finish_date = training_date + timedelta(days=random.choice([0, 1, 2]))
            effectiveness_date = None
            if random.random() < 0.5 and (TODAY - finish_date).days > 21:
                candidate_eff = finish_date + timedelta(days=random.randint(14, 40))
                effectiveness_date = candidate_eff if candidate_eff <= TODAY else None
            participant_repo.create(
                training_id, worker_id, start_date, finish_date,
                random.choice([None, None, 'Ukończono z wynikiem pozytywnym.']),
            )
            if effectiveness_date:
                participants_of_training = participant_repo.get_by_training(training_id)
                row = next(p for p in participants_of_training if p['worker_id'] == worker_id)
                participant_repo.update(row['id'], start_date, finish_date, row['remarks'], effectiveness_date)
            participant_count += 1

    print(f'  {training_count} trainings, {participant_count} participants.')


def seed_action_plans(gaps: list, boss_of: dict, job_workers: dict):
    print('Seeding action_plans against real competency gaps...')
    if not gaps:
        print('  no gaps generated — skipping.')
        return
    repo = ActionPlanRepository()
    skill_descriptions = {s: d for s, d in SKILLS}
    skill_descriptions.update({'2001': 'Audytor wewnętrzny ISO9001/IATF', '2002': 'Planowanie produkcji'})
    fallback_manager = (job_workers.get('KIER_JAK') or job_workers.get('DYR') or [None])[0]

    targets = random.sample(gaps, k=min(7, len(gaps)))
    statuses = ['defined', 'defined', 'in_progress', 'in_progress', 'completed', 'completed', 'effective']

    created = 0
    for (worker_id, skill_id, _gap), status in zip(targets, statuses):
        responsible_id = boss_of.get(worker_id) or fallback_manager
        if not responsible_id:
            continue
        description = f"Szkolenie uzupełniające kompetencję: {skill_descriptions.get(skill_id, skill_id)}"

        if status in ('completed', 'effective'):
            planned_date = _rand_date(-60, -20)
        else:
            planned_date = _rand_date(15, 60)

        plan_id = repo.create(
            worker_id=worker_id, skill_id=skill_id, description=description,
            responsible_id=responsible_id, planned_date=planned_date, status='defined',
        )
        created += 1

        if status != 'defined':
            completed_date = _rand_date(-25, -5) if status in ('completed', 'effective') else None
            effectiveness_date = None
            if status == 'effective' and completed_date:
                candidate = completed_date + timedelta(days=random.randint(10, 20))
                effectiveness_date = candidate if candidate <= TODAY else TODAY
            repo.update(
                plan_id, description=description, responsible_id=responsible_id,
                planned_date=planned_date, status=status,
                completed_date=completed_date, effectiveness_date=effectiveness_date,
            )

    print(f'  {created} action_plans created (statuses: {", ".join(statuses[:created])}).')


def main():
    force = '--force' in sys.argv
    app = create_app()
    with app.app_context():
        total_workers = WorkerRepository().get_all(status='all', page=1, page_size=1)[1]
        if total_workers >= 10 and not force:
            print(f'Mock data already appears seeded ({total_workers} workers found) — skipping.')
            print('Pass --force to seed another full batch on top of the existing data.')
            return

        seed_dictionaries()
        job_workers, boss_of = seed_workers()
        gaps = seed_worker_skills(job_workers)
        seed_medical_and_bhp(job_workers)
        seed_trainings(job_workers)
        seed_action_plans(gaps, boss_of, job_workers)

        print('\nDone. Mock data seeded across jobs/skills/workers/competency/medical/bhp/trainings/action_plans.')


if __name__ == '__main__':
    main()
