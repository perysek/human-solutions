"""CI guard: every newly-added Alembic migration that creates a table must
give that table a tenant_id column, unless it's explicitly exempted (global,
product-defined tables like roles/role_permissions — see
MULTI_TENANCY_PROPOSAL.md §3.2, 'Explicitly NOT tenant-scoped').

Only checks migration files ADDED in this diff — not the historical chain,
which predates the tenants table and is handled by Phase 2's own migrations,
not this guard.
"""
import re
import subprocess
import sys

# CI runs on Linux (UTF-8 by default); a local Windows terminal defaults to
# cp1252 and would otherwise raise/mangle the '§' below.
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

EXEMPT_TABLES = {
    # Global, product-defined tables — never tenant-scoped (MULTI_TENANCY_PROPOSAL.md §3.2).
    'tenants', 'roles', 'role_permissions', 'alembic_version',

    # Grandfathered: created on the phase-0-staamp-rbac-foundation branch before
    # the tenant_id convention existed and before this guard was wired into CI
    # (SCALING_PREP_PLAN.md Phase 2/3). The guard diffs new migrations against
    # origin/master, but this branch has been diverged from master for a long
    # time, so — until it merges — every table already on this branch reads as
    # "new" relative to master and would otherwise false-flag on unrelated PRs.
    # Retrofitting tenant_id onto these is real work, deliberately out of scope
    # here (MULTI_TENANCY_PROPOSAL.md Phase B/C) — remove entries from this
    # block as each table actually gets tenant_id added.
    'workers', 'birth_data', 'worker_nationality', 'foreigner_data',
    'jobs', 'skills', 'job_skills', 'worker_skills', 'worker_skill_remarks',
    'departments',
    'medical_exams', 'bhp_trainings',
    'trainings', 'training_participants', 'training_job', 'training_skills',
    'training_trainers', 'training_sign_in_tokens', 'training_presence_confirmations',
    'action_plans',
    'alert_thresholds',
    'worker_onboarding_status',
    'worker_terminations',
}

CREATE_TABLE_RE = re.compile(r"op\.create_table\(\s*['\"](\w+)['\"]")


def added_migration_files(base_ref: str) -> list[str]:
    out = subprocess.run(
        ['git', 'diff', '--name-only', '--diff-filter=A', f'{base_ref}...HEAD',
         '--', 'alembic/versions/'],
        capture_output=True, text=True, check=True,
    ).stdout
    return [f for f in out.splitlines() if f.endswith('.py')]


def _call_end(text: str, open_paren_idx: int) -> int:
    """Index just past the '(' at open_paren_idx's matching close paren."""
    depth = 0
    for i in range(open_paren_idx, len(text)):
        if text[i] == '(':
            depth += 1
        elif text[i] == ')':
            depth -= 1
            if depth == 0:
                return i + 1
    return len(text)


def check_file(path: str) -> list[str]:
    text = open(path, encoding='utf-8').read()
    violations = []
    for match in CREATE_TABLE_RE.finditer(text):
        table = match.group(1)
        if table in EXEMPT_TABLES:
            continue
        # Scope the search to just this op.create_table(...) call via
        # balanced-paren matching — a fixed-size lookahead window would leak
        # into a *later* create_table() call in the same file (this repo
        # routinely creates several tables per migration), letting a
        # tenant_id on a later table mask a missing one on an earlier table.
        open_paren_idx = text.index('(', match.start())
        window = text[match.start():_call_end(text, open_paren_idx)]
        if 'tenant_id' not in window:
            violations.append(f"{path}: table '{table}' has no tenant_id column")
    return violations


if __name__ == '__main__':
    base_ref = sys.argv[1] if len(sys.argv) > 1 else 'origin/master'
    violations = []
    for f in added_migration_files(base_ref):
        violations.extend(check_file(f))
    if violations:
        print("New table(s) missing tenant_id (MULTI_TENANCY_PROPOSAL.md §3.2):")
        for v in violations:
            print(f"  - {v}")
        print("\nIf this table is genuinely global/product-defined (like roles), "
              "add it to EXEMPT_TABLES in scripts/check_new_migrations_have_tenant_id.py "
              "with a one-line reason.")
        sys.exit(1)
    print("OK — no new tenant-unaware tables.")
