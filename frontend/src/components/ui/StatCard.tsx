import { Icon } from '@/lib/icons/Icon';

type StatColor = 'blue' | 'green' | 'purple' | 'orange';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: string;
  color?: StatColor;
}

/** Matches input.css .stats-grid / .stat-card / .stat-icon / .stat-value / .stat-label. */
export function StatCard({ label, value, icon, color = 'blue' }: StatCardProps) {
  return (
    <div className="stat-card">
      <div>
        <p className="stat-label mb-1">{label}</p>
        <p className={`stat-value ${color}`}>{value}</p>
      </div>
      <div className={`stat-icon ${color}`}>
        <Icon name={icon} size={24} />
      </div>
    </div>
  );
}
