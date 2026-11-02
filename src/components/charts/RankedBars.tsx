import type { Key, ReactNode } from 'react';
import { ACTIVE_BG, CHART_COUNT, CHART_TEXT, FADED_OPACITY, useActivePart } from './useActivePart';

/** One bar of a research bar chart: its name, its count and its fill. */
export interface RankedBar {
  key: Key;
  label: ReactNode;
  value: number;
  /** The bar's fill (a colour, or a pattern such as stripes for "not found"). */
  fill: string;
  /** What the bar is, as one sentence (its accessible name). */
  sentence: string;
}

/**
 * The Frequent service story's bar chart: a name, a rounded bar on a shared track and the count, one row per bar. It picks a
 * bar the split bar's way (useActivePart): hovering, focusing or tapping a row fades the other bars and highlights its name,
 * and the names and counts use the split bar legend's text (CategorySpark, SplitBar).
 */
export default function RankedBars({ bars, max, label }: {
  bars: readonly RankedBar[];
  /** The value a full-width bar stands for (shared when two charts sit on one scale). */
  max: number;
  /** The chart's accessible name. */
  label: string;
}) {
  const { active, clear, faded, partEvents } = useActivePart();
  return (
    <div role="group" aria-label={label} className="space-y-3 select-none" onMouseLeave={clear}>
      {bars.map(bar => (
        <button
          key={bar.key}
          type="button"
          aria-label={bar.sentence}
          {...partEvents(bar.key)}
          className={`grid w-full cursor-pointer grid-cols-[4.5rem_1fr_3rem] items-center gap-3 rounded-sm border-0 bg-transparent p-0 text-left outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${CHART_TEXT}`}
        >
          <span>
            <span data-active={active === bar.key ? 'true' : undefined} className="-mx-1.5 inline-block rounded-md px-1.5 py-0.5 leading-4 transition-colors"
              style={active === bar.key ? { background: ACTIVE_BG } : undefined}>{bar.label}</span>
          </span>
          <span className="block h-3 overflow-hidden rounded-full bg-[var(--bg-stat)]" aria-hidden="true">
            <span className="block h-full rounded-full opacity-90 transition-opacity"
              style={{ width: `${(bar.value / max) * 100}%`, background: bar.fill, opacity: faded(bar.key) ? FADED_OPACITY : undefined }} />
          </span>
          <span className={`text-right tabular-nums ${CHART_COUNT}`}>{bar.value}</span>
        </button>
      ))}
    </div>
  );
}
