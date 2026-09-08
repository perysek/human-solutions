"""One-time backfill: seed worker_absence_approvers from the org chart's
derived "boss" relationship, for workers HR has never explicitly configured.

Why this exists (see alembic/versions/ab01absc0001_create_worker_absence_tables.py
and repositories/absences/absence_approver_repository.py's module docstring):
worker_absence_approvers is intentionally NOT derived from the org chart at
request time — "przełożony" there can be multi-valued or empty (see
WorkerRepository._BASE_COLUMNS's boss_name), which doesn't fit a deterministic
one-request-one-approver workflow, so HR is meant to assign it explicitly
per worker via the admin UI (AbsenceBalancesPage's approver section).

But the table ships empty (the migration only creates it) and nothing has
ever populated it — confirmed empty on the local dev DB (0 rows across 32
active workers). Every worker whose job isn't jobs.is_director therefore
sees the "Przełożony" dropdown on 'Moje nieobecności' -> 'Nowy wniosek'
disabled ("Brak przypisanego przełożonego — skontaktuj się z HR"), making
the self-service absence-request flow unusable company-wide, even though
the org chart clearly shows an active supervisor for every worker.

This script seeds one row per (worker, active holder of that worker's
derived boss job) — the exact three-tier CASE WorkerRepository uses to
compute boss_name (regular job -> department's managerial job; managerial
job -> the director job; director -> nobody) — but ONLY for workers who
currently have zero rows in worker_absence_approvers, so it never overrides
or duplicates anything HR has already configured (or deliberately removed)
by hand. Safe to re-run any time (e.g. after new hires): it only fills gaps.

Usage:
    python scripts/backfill_absence_approvers.py            # dry run, prints the plan
    python scripts/backfill_absence_approvers.py --apply    # writes it (audited via WorkerAbsenceApproverRepository)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

_BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(_BASE_DIR / '.env')
load_dotenv(_BASE_DIR / '.env.local', override=True)

from app import create_app
from config.database import DatabaseConnection
from repositories.absences.absence_approver_repository import WorkerAbsenceApproverRepository

_DERIVED_BOSS_QUERY = """
    SELECT w.id AS worker_id, w.firstname, w.surname,
           bw.id AS approver_worker_id, bw.firstname AS approver_firstname, bw.surname AS approver_surname
    FROM workers w
    JOIN jobs j ON j.id = w.job_id
    LEFT JOIN jobs sj ON sj.department_id = j.department_id
        AND sj.is_managerial = TRUE AND sj.id != j.id
    LEFT JOIN jobs dj ON dj.is_director = TRUE AND dj.id != j.id
    JOIN workers bw
        ON bw.job_id = (CASE WHEN j.is_director THEN NULL WHEN j.is_managerial THEN dj.id ELSE sj.id END)
        AND bw.fire_date IS NULL
    WHERE w.fire_date IS NULL
      AND w.id != bw.id
      AND NOT EXISTS (
          SELECT 1 FROM worker_absence_approvers a WHERE a.worker_id = w.id
      )
    ORDER BY w.surname, w.firstname
"""


def main():
    apply_changes = '--apply' in sys.argv[1:]
    app = create_app()
    with app.app_context():
        conn = DatabaseConnection.get_connection()
        cur = conn.cursor()
        cur.execute(_DERIVED_BOSS_QUERY)
        rows = cur.fetchall()

        if not rows:
            print("Nothing to backfill — every worker already has at least one approver row.")
            return

        verb = "Assigning" if apply_changes else "Would assign"
        print(f"{verb} {len(rows)} approver relationship(s):")
        for r in rows:
            print(f"  {r['surname']} {r['firstname']} (#{r['worker_id']}) -> "
                  f"{r['approver_surname']} {r['approver_firstname']} (#{r['approver_worker_id']})")

        if not apply_changes:
            print("\nDry run only — re-run with --apply to write these.")
            return

        repo = WorkerAbsenceApproverRepository()
        for r in rows:
            repo.add(r['worker_id'], r['approver_worker_id'])
        print(f"\nDone — {len(rows)} row(s) written to worker_absence_approvers.")


if __name__ == '__main__':
    main()
