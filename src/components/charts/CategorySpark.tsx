import type { Key } from 'react';
import { withCount } from './chartCategories';
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
 * its name below, in the split bar legend's text (#1290). Columns with no count are dropped (chartCategories) unless the chart passes keepEmpty, which keeps their place on the axis without a bar.
 */
export default function CategorySpark({ columns: allColumns, keepEmpty = false, label, ticks, height = 120, defaultKey = null, details }: {
  columns: readonly SparkColumn[];
  /** The chart's accessible name. */
  label: string;
  /** The value axis, lowest to highest (pass the same to charts that compare). */
  ticks: readonly number[];
  height?: number;
  /** The column highlighted while nothing is hovered, focused or tapped. */
  defaultKey?: Key | null;
  /** The id of the chart's table for screen readers (ChartTableDetails), linked with aria-details. */
  details?: string;
  /** Keep columns with no count in their place on the axis (chartCategories: only where the empty column is the point). */
  keepEmpty?: boolean;
}) {
  const columns = withCount(allColumns, keepEmpty);
  const { active, clear, faded, partEvents } = useActivePart(defaultKey);
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const pos = (v: number) => Math.max(0, Math.min(height, ((v - lo) / (hi - lo || 1)) * height));
  return (
    <figure className="m-0">
      {/* Each column, its count, bar and name, is one target for the pointer, tap and keyboard, with the pointer cursor throughout (#1290). */}
      <div className="relative mt-2.5 select-none pt-4" style={{ paddingLeft: AXIS_W }} onMouseLeave={clear}>
        <div className="absolute inset-x-0 top-4" style={{ height }} aria-hidden="true">
          <SparkTicks ticks={ticks} y={t => height - pos(t)} format={t => t.toLocaleString()} textClassName="text-[var(--text-primary)]" />
        </div>
        <div role="group" aria-label={label} aria-details={details} className="relative flex gap-1">
          {columns.map(c => {
            const inner = (
              <>
                <span className="relative block w-full" style={{ height }} aria-hidden="true">
                  {c.value > 0 && <>
                    <span data-bar className={`${SPARK_BAR} opacity-90 transition-opacity`} style={{ bottom: 0, height: Math.max(2, pos(c.value)), background: c.fill, opacity: faded(c.key) ? FADED_OPACITY : undefined }} />
                    <span className={`absolute left-1/2 -translate-x-1/2 whitespace-nowrap leading-3 ${CHART_TEXT} ${CHART_COUNT}`} style={{ bottom: Math.max(2, pos(c.value)) + 2 }}>{c.value.toLocaleString()}</span>
                  </>}
                </span>
                <span className="mt-1 block break-words text-center" aria-hidden="true">
                  <span data-active={active === c.key ? 'true' : undefined} className={`inline-block rounded-md px-0 py-0.5 leading-4 transition-colors sm:px-1.5 ${CHART_TEXT}`}
                    style={active === c.key ? { background: ACTIVE_BG } : undefined}>{c.label}</span>
                </span>
              </>
            );
            return c.value > 0 ? (
              <button key={c.key} type="button" aria-label={c.sentence} {...partEvents(c.key)}
                className="flex min-w-0 flex-1 cursor-pointer select-none flex-col rounded-sm border-0 bg-transparent p-0 outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
                {inner}
              </button>
            ) : <div key={c.key} className="flex min-w-0 flex-1 cursor-default flex-col">{inner}</div>;
          })}
        </div>
      </div>
    </figure>
  );
}
