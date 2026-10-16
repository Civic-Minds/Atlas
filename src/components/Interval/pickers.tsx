import type { ReactNode } from 'react';
import Pill from '../ui/Pill';
import LegendItem from '../ui/LegendItem';
import { HEADWAY_TIERS, getTierColor } from '../../utils/colors';
import { headwayFilterLabel } from '../../utils/headwayText';
import { useColorVision } from '../../context/ColorVisionContext';
import { DAY_TYPES, type DayType } from '../../../shared/dayTypes';
import { PERIOD_KEYS, PERIOD_LABELS, type TimePeriod } from '../../hooks/useIntervalStats';

/**
 * The frequency, day and time pickers every filter surface uses (the Frequency / Day / Time dropdowns, the phone filter panel,
 * Settings and the Compare side picker), so the same choice has the same labels, colours and order everywhere.
 */

/** The text of a frequency choice: "All routes" for no limit, else "Every 10 min or better" style. */
export const frequencyOptionLabel = (max: number) => (max === Infinity ? 'All routes' : headwayFilterLabel(max));

/** The dot colour of a frequency choice (grey for "All routes"). */
export function tierDotColor(max: number, colorMode: 'default' | 'friendly'): string {
  return isFinite(max) ? getTierColor(String(max), colorMode) : 'var(--text-dim)';
}

/** Every frequency choice with its label and dot colour, for pickers that draw their own rows (the dropdown list). */
export function useFrequencyOptions() {
  const { colorVisionFriendly } = useColorVision();
  const colorMode = colorVisionFriendly ? 'friendly' : 'default';
  return HEADWAY_TIERS.map(({ max, label }) => ({ max, key: label, label: frequencyOptionLabel(max), color: tierDotColor(max, colorMode) }));
}

/** A heading above a picker: one style on every surface. `className` is for the surface's own padding. */
export function PickerSection({ title, className = '', children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <div className={className}>
      <p className="mb-1.5 text-xs font-black text-[var(--text-dim)]">{title}</p>
      {children}
    </div>
  );
}

export function FrequencyPicker({ value, onChange }: { value: number; onChange: (max: number) => void }) {
  const options = useFrequencyOptions();
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(o => (
        <Pill size="segment" key={o.key} onClick={() => onChange(o.max)} selected={value === o.max}>
          <LegendItem color={o.color}>{o.label}</LegendItem>
        </Pill>
      ))}
    </div>
  );
}

/** Weekday, Saturday, Sunday. `fill` stretches the buttons across the row. */
export function DayPicker({ value, onChange, fill = false }: { value: DayType; onChange: (day: DayType) => void; fill?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1">
      {DAY_TYPES.map(d => (
        <Pill size="segment" key={d} className={fill ? 'flex-1' : ''} onClick={() => onChange(d)} selected={value === d}>
          {d}
        </Pill>
      ))}
    </div>
  );
}

/** The time periods. `includeAll` adds "All day" first (Settings and Compare have it; the map's own chips do not). */
export function PeriodPicker({ value, onChange, includeAll = false }: { value: TimePeriod; onChange: (period: TimePeriod) => void; includeAll?: boolean }) {
  const options: TimePeriod[] = includeAll ? ['all', ...PERIOD_KEYS] : [...PERIOD_KEYS];
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(p => (
        <Pill size="segment" key={p} onClick={() => onChange(p)} selected={value === p}>
          {PERIOD_LABELS[p]}
        </Pill>
      ))}
    </div>
  );
}
