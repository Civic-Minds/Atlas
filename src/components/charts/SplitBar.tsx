import { useState, type Key, type ReactNode } from 'react';
import LegendItem from '../ui/LegendItem';

/** One part of a split bar: its count, fill, a sentence for screen readers and its legend words. */
export interface SplitBarSegment {
  key: Key;
  value: number;
  /** A colour, or a pattern such as stripes for "not found". */
  fill: string;
  /** What the part is, as one sentence (the segment's and legend item's accessible name). */
  sentence: string;
  /** The legend item's words after its swatch. */
  legend: ReactNode;
}

/**
 * One long bar split into parts by count, with a short wrapping legend under it (the agency and area pages' weekday
 * frequency bar, the Free child fares page). Hovering, focusing or tapping a part highlights its legend item and fades the
 * other parts; the legend items do the same in reverse. Parts with no count are left out.
 */
export default function SplitBar({ segments, label, trailing }: {
  segments: readonly SplitBarSegment[];
  /** The bar's accessible name. */
  label: string;
  /** Beside the legend, at its right on wide screens (a link). */
  trailing?: ReactNode;
}) {
  const [active, setActive] = useState<Key | null>(null);
  const shown = segments.filter(s => s.value > 0);
  if (shown.length === 0) return null;
  const faded = (key: Key) => active !== null && active !== key;
  return (
    <div className="mt-5">
      <div onMouseLeave={() => setActive(null)}>
        <div role="group" aria-label={label} className="flex h-4 gap-0.5 overflow-hidden rounded-full">
          {shown.map(s => (
            <button key={s.key} type="button" aria-label={s.sentence} className="h-full min-w-1 cursor-pointer border-0 p-0 outline-offset-2 transition-opacity"
              style={{ flexGrow: s.value, flexBasis: 0, background: s.fill, opacity: faded(s.key) ? 0.35 : 1 }}
              onMouseEnter={() => setActive(s.key)} onFocus={() => setActive(s.key)} onBlur={() => setActive(null)}
              onClick={() => setActive(a => (a === s.key ? null : s.key))} />
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-primary)]">
          {shown.map(s => (
            <li key={s.key} data-active={active === s.key ? 'true' : undefined}
              tabIndex={0} aria-label={s.sentence}
              className="-mx-1.5 flex cursor-pointer select-none items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-0.5 outline-offset-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              style={active === s.key ? { background: 'var(--bg-btn-hover)' } : undefined}
              onMouseEnter={() => setActive(s.key)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(s.key)} onBlur={() => setActive(null)} onClick={() => setActive(a => (a === s.key ? null : s.key))}>
              <LegendItem color={s.fill}>{s.legend}</LegendItem>
            </li>
          ))}
        </ul>
        {trailing}
      </div>
    </div>
  );
}
