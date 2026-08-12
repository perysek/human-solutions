import { ALL_MODULES, MODULE_DISPLAY_NAMES, type ModuleFlags } from '@/lib/api/roles';

interface RolePermissionMatrixProps {
  value: Record<string, ModuleFlags>;
  onChange?: (moduleName: string, hasAccess: boolean) => void;
  readOnly?: boolean;
}

/** Simplified matrix: toggles has_access per module. read_only/own_data/etc.
 * sub-flags aren't exposed in this UI — RoleForm preserves whatever the
 * backend already had for them rather than clobbering to false.
 *
 * A grid of checkbox tiles rather than an 11-row, one-column table: the
 * table forced every module onto its own row (~480px of pure list height
 * for 11 modules), while the grid wraps modules across 2-4 columns
 * depending on available width, and each tile's whole area — not just the
 * checkbox — is the click target via the native <label> wrap. */
export function RolePermissionMatrix({ value, onChange, readOnly }: RolePermissionMatrixProps) {
  return (
    <div className="permission-grid">
      {ALL_MODULES.map((m) => (
        <label key={m} className="permission-tile">
          <input
            type="checkbox"
            checked={value[m]?.has_access ?? false}
            disabled={readOnly}
            onChange={(e) => onChange?.(m, e.target.checked)}
          />
          {MODULE_DISPLAY_NAMES[m] ?? m}
        </label>
      ))}
    </div>
  );
}
