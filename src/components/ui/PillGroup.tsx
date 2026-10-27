import type { ReactNode } from 'react';
import Pill from './Pill';

/** The row every Live page puts its switchers in: one gap between groups wherever it appears. */
export const PILL_ROW = 'flex flex-wrap items-center gap-x-6 gap-y-2';

/**
 * One switcher: a group of segment pills, one selected. The only switcher style on the Live pages (top bar, route and agency
 * pages, views, direction, time of day). `outlined` draws the group inside one rounded outline, as the map's Night and
 * Frequent Service filter rows do.
 */
export default function PillGroup({ label, options, value, onChange, outlined = false }: { label: string; options: ReadonlyArray<readonly [string, ReactNode]>; value: string; onChange: (v: string) => void; outlined?: boolean }) {
  return (
    <div className={outlined ? 'flex items-center gap-1 rounded-full border border-[var(--border-primary)] p-0.5' : 'flex flex-wrap gap-1.5'} role="group" aria-label={label}>
      {options.map(([k, text]) => <Pill key={k} size="segment" selected={value === k} onClick={() => onChange(k)}>{text}</Pill>)}
    </div>
  );
}
