import type { ReactNode } from 'react';
import Pill from './Pill';

/** The row every Live page puts its switchers in: one gap between groups wherever it appears. */
export const PILL_ROW = 'flex flex-wrap items-center gap-x-6 gap-y-2';

/**
 * One switcher: a group of segment pills, one selected. The only switcher style on the Live pages (top bar, route and agency pages, views, direction, time of day).
 * Values are strings or numbers (a direction id), and onChange gets the value back in the same type.
 */
export default function PillGroup<T extends string | number = string>({ label, options, value, onChange }: { label: string; options: ReadonlyArray<readonly [T, ReactNode]>; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {options.map(([k, text]) => <Pill key={String(k)} size="segment" selected={value === k} onClick={() => onChange(k)}>{text}</Pill>)}
    </div>
  );
}
