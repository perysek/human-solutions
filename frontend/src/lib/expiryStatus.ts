/**
 * Shared "ważne / poprzednie / nieważne" status logic for any table of
 * dated records with a `valid_until` (medical exams, BHP trainings) —
 * one definition so WorkerMedicalSection, WorkerBhpSection and
 * WorkerAttentionSection can never drift on what counts as expired.
 */

export type ExpiryStatus = 'valid' | 'previous' | 'invalid';

export const EXPIRY_STATUS_LABELS: Record<ExpiryStatus, string> = {
  valid: 'Ważne',
  previous: 'Poprzednie',
  invalid: 'Nieważne',
};

export const EXPIRY_STATUS_BADGE_CLASS: Record<ExpiryStatus, string> = {
  valid: 'badge-green',
  previous: 'badge-gray',
  invalid: 'badge-red',
};

/** Local (not UTC) today as 'YYYY-MM-DD' — comparable directly against the
 * `valid_until` strings the API returns, same convention as
 * ActionPlanModal's own todayStr(). */
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysAgoStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** No expiry set ("bezterminowe") counts as currently valid — mirrors how
 * every backend "expiring" query (alert_service.get_expiring_medical/bhp)
 * already excludes `valid_until IS NULL` rows from ever being flagged. */
export function isRowCurrentlyValid(validUntil: string | null): boolean {
  return validUntil == null || validUntil >= todayStr();
}

export function tableHasValidRow<T extends { valid_until: string | null }>(rows: T[]): boolean {
  return rows.some((r) => isRowCurrentlyValid(r.valid_until));
}

/** A row past its own expiry reads 'previous' when some OTHER row in the
 * same table is still valid (a superseded historical record) — otherwise
 * 'invalid' (red): nothing in the table is currently valid. Pass the
 * table's own tableHasValidRow(rows) result so callers rendering many rows
 * only compute it once. */
export function expiryRowStatus(validUntil: string | null, tableHasValid: boolean): ExpiryStatus {
  if (isRowCurrentlyValid(validUntil)) return 'valid';
  return tableHasValid ? 'previous' : 'invalid';
}

/** task3's "Dodaj ..." enable rule: light-red + enabled only when the
 * table has a currently-invalid (red) row, or any row's own expiry lapsed
 * more than 14 days ago — otherwise disabled. */
export function shouldHighlightAddButton<T extends { valid_until: string | null }>(rows: T[]): boolean {
  const hasValid = tableHasValidRow(rows);
  const hasRedRow = rows.some((r) => expiryRowStatus(r.valid_until, hasValid) === 'invalid');
  if (hasRedRow) return true;
  const cutoff = daysAgoStr(14);
  return rows.some((r) => r.valid_until != null && r.valid_until < cutoff);
}
