import { ALL_MODULES, MODULE_DISPLAY_NAMES, type ModuleFlags } from '@/lib/api/roles';

interface RolePermissionMatrixProps {
  value: Record<string, ModuleFlags>;
  onChange?: (moduleName: string, hasAccess: boolean) => void;
  readOnly?: boolean;
}

/** Simplified matrix: toggles has_access per module. read_only/own_data/etc.
 * sub-flags aren't exposed in this UI — RoleForm preserves whatever the
 * backend already had for them rather than clobbering to false. */
export function RolePermissionMatrix({ value, onChange, readOnly }: RolePermissionMatrixProps) {
  return (
    <div className="table-container">
      <table className="refined-table">
        <thead>
          <tr>
            <th>Moduł</th>
            <th className="text-right">Dostęp</th>
          </tr>
        </thead>
        <tbody>
          {ALL_MODULES.map((m) => (
            <tr key={m}>
              <td>{MODULE_DISPLAY_NAMES[m] ?? m}</td>
              <td className="text-right">
                <input
                  type="checkbox"
                  style={{ accentColor: 'var(--color-accent)' }}
                  checked={value[m]?.has_access ?? false}
                  disabled={readOnly}
                  onChange={(e) => onChange?.(m, e.target.checked)}
                  aria-label={`Dostęp do modułu ${MODULE_DISPLAY_NAMES[m] ?? m}`}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
