import type { Key } from 'react';
import { AXIS_W, SPARK_BAR, SparkTicks } from './sparkParts';
import { ACTIVE_BG, CHART_COUNT, CHART_TEXT, FADED_OPACITY, useActivePart } from './useActivePart';

/** One column: its name under the axis, its count and fill, and a sentence for screen readers. */
export interface SparkColumn {
  key: Key;
  label: string;
  value: number;
  /** A colour, or a pattern such as stripes for "not found". */
  fill: string;
  sentence: string;
}

/**
 * A column per group in the sparkline charts' shape (HourSpark's bars, ticks and axis), with the split bar's way of picking a
 * part: hovering, focusing or tapping a column fades the others and highlights its name. Each count sits above its bar and
 * its name below, in the split bar legend's text (#1290). Columns with no count keep their place on the axis without a bar.
 */
export default function CategorySpark({ columns, label, ticks, height = 120 }: {
  columns: readonly SparkColumn[];
  /** The chart's accessible name. */
  label: string;
  /** The value axis, lowest to highest (pass the same to charts that compare). */
  ticks: readonly number[];
  height?: number;
}) {
  const { active, clear, faded, partEvents } = useActivePart();
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const pos = (v: number) => Math.max(0, Math.min(height, ((v - lo) / (hi - lo || 1)) * height));
  return (
    <figure className="m-0">
      <div onMouseLeave={clear}>
        <div className="relative mt-2.5 pt-4" style={{ paddingLeft: AXIS_W }}>
          <div className="absolute inset-x-0 bottom-0" style={{ height }} aria-hidden="true">
            <SparkTicks ticks={ticks} y={t => height - pos(t)} format={t => t.toLocaleString()} textClassName="text-[var(--text-primary)]" />
          </div>
          <div role="group" aria-label={label} className="relative flex gap-1" style={{ height }}>
            {columns.map(c => c.value > 0 ? (
              <button key={c.key} type="button" aria-label={c.sentence} className="relative h-full min-w-0 flex-1 cursor-pointer rounded-sm border-0 bg-transparent p-0 outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]" {...partEvents(c.key)}>
                <span className={`${SPARK_BAR} opacity-90 transition-opacity`} style={{ bottom: 0, height: Math.max(2, pos(c.value)), background: c.fill, opacity: faded(c.key) ? FADED_OPACITY : undefined }} />
                <span aria-hidden="true" className={`pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap leading-3 ${CHART_TEXT} ${CHART_COUNT}`} style={{ bottom: Math.max(2, pos(c.value)) + 2 }}>{c.value.toLocaleString()}</span>
              </button>
            ) : <div key={c.key} className="min-w-0 flex-1" />)}
          </div>
        </div>
        {/* The names light up and answer the pointer as the split bar's legend items do; the bars above are the one tab stop per group. */}
        <ul className="m-0 mt-1 flex list-none gap-1 p-0" style={{ marginLeft: AXIS_W }} aria-hidden="true">
          {columns.map(c => (
            <li key={c.key} className="min-w-0 flex-1 break-words text-center">
              {c.value > 0 ? (
                <span data-active={active === c.key ? 'true' : undefined}
                  className={`inline-block cursor-pointer select-none rounded-md px-0 py-0.5 leading-4 transition-colors sm:px-1.5 ${CHART_TEXT}`}
                  style={active === c.key ? { background: ACTIVE_BG } : undefined}
                  onMouseEnter={partEvents(c.key).onMouseEnter} onClick={partEvents(c.key).onClick} onMouseLeave={clear}>
                  {c.label}
                </span>
              ) : <span className={`inline-block px-0 py-0.5 leading-4 sm:px-1.5 ${CHART_TEXT}`}>{c.label}</span>}
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}
