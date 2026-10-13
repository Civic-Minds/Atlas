import { THRESHOLDS, type Threshold } from '../shared/agencyPages';
import { CONTROL_ACTIVE, CONTROL_INACTIVE, FILTER_OPTION } from './styles';

/** The 10 / 15 / 30 standard picker, in the app's flat pill style (selected tint, aria-pressed). */
export function ThresholdToggle({ value, onChange }: { value: Threshold; onChange: (t: Threshold) => void }) {
  return (
    <div role="group" aria-label="Every N minutes or better" className="flex flex-wrap items-center gap-1.5">
      {THRESHOLDS.map(t => (
        <button
          key={t}
          type="button"
          aria-pressed={value === t}
          onClick={() => onChange(t)}
          className={`${FILTER_OPTION} ${value === t ? CONTROL_ACTIVE : CONTROL_INACTIVE}`}
        >
          {t} min
        </button>
      ))}
    </div>
  );
}

export interface StatItem {
  value: string;
  label: string;
}

/** Plain large numbers with small labels in one row, separated by space only (wraps on phones). */
export function StatRow({ items }: { items: StatItem[] }) {
  return (
    <dl className="mt-8 flex flex-wrap gap-x-12 gap-y-6">
      {items.map(item => (
        <div key={item.label} className="min-w-0 max-w-[16rem]">
          <dd className="whitespace-nowrap text-3xl font-black tracking-tight">{item.value}</dd>
          <dt className="mt-1 text-sm text-[var(--text-muted)]">{item.label}</dt>
        </div>
      ))}
    </dl>
  );
}
