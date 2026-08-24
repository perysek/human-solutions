import { Icon } from '@/lib/icons/Icon';
import { useCountUp } from '@/lib/useCountUp';

type StatColor = 'blue' | 'green' | 'purple' | 'orange';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: string;
  color?: StatColor;
  /** Position within its stats-grid — staggers the entrance animation. */
  index?: number;
}

/** Numeric values count up from 0 (mount) / their previous value (refresh);
 * non-numeric values (e.g. the '…' loading placeholder) render as-is. */
function StatValue({ value }: { value: string | number }) {
  const numeric = typeof value === 'number' ? value : null;
  const animated = useCountUp(numeric ?? 0);
  return <>{numeric === null ? value : animated}</>;
}

/** Matches input.css .stats-grid / .stat-card / .stat-icon / .stat-value / .stat-label. */
export function StatCard({ label, value, icon, color = 'blue', index = 0 }: StatCardProps) {
  return (
    <div className="stat-card stagger-item" style={{ animationDelay: `${index * 50}ms` }}>
      <div>
        <p className="stat-label mb-1">{label}</p>
        <p className={`stat-value ${color}`}>
          <StatValue value={value} />
        </p>
      </div>
      <div className={`stat-icon ${color}`}>
        <Icon name={icon} size={24} />
      </div>
    </div>
  );
}
