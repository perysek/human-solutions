"""
"Widok administratora" (admin view) — owner-employee data exclusion.

In the reference project this hides the superuser-linked employee's
revenue-generating activity from staff-facing lists unless a session flag is
toggled on (see the sidebar's admin-view/own-data toggles, intentionally not
ported — frontend/README.md). That whole feature belongs to the
invoicing/appointments domain this build doesn't include, so this is a
no-op stub: EmployeeRepository imports and calls it defensively (`{excl}` in
an f-string), but it never actually excludes anything here.
"""


def emp_exclusion_sql_inline(id_column: str) -> str:
    """Return a SQL fragment to AND into a WHERE clause. Always empty (no-op) here."""
    return ""
