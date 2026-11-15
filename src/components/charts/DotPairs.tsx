import type { Key, ReactNode } from 'react';
import { percentText } from '../../../shared/numberText';
import { ACTIVE_BG, CHART_COUNT, CHART_TEXT, FADED_OPACITY, useActivePart } from './useActivePart';

/** The two series of a dot-pair chart: the solid dots (first) and the rings (second). */
export type DotPairSeriesKey = 'first' | 'second';
/** The highlighted series, shared by the key and every chart it explains (useActivePart's state and events). */
export type DotPairSeries = ReturnType<typeof useActivePart>;
/** CIV-1577 (Ryan: "similar to how the sparklines work"; VISUAL.md: a chart's legend picks its series): while a series is
 * highlighted, the other series and the joining line fade to FADED_OPACITY, the split bar's and CategorySpark's fade. */
const seriesFade = (series: DotPairSeries | undefined, key: DotPairSeriesKey | 'line') =>
  (series?.faded(key) ? { opacity: FADED_OPACITY } : undefined);
const SERIES_PART = 'transition-opacity';

/** One row of a dot-pair chart: two shares of the same thing (0–1), joined by a line. */
export interface DotPair {
  key: Key;
  label: ReactNode;
  /** The first share, drawn as a solid dot. */
  first: number;
  /** The second share, drawn as a ring. */
  second: number;
  /** What the row is, as one sentence (its accessible name). */
  sentence: string;
  /** A reference row (such as a national figure): its name in the group-heading weight, above a rule. */
  reference?: boolean;
}

export interface DotPairGroup {
  key: Key;
  /** The group’s name, above its rows (the story’s chart heading: h3, font-bold with CHART_TEXT). A group with no rows isn’t drawn. */
  title?: ReactNode;
  pairs: readonly DotPair[];
}

/** A reference row's name reads as its group's heading: the bold of the story's chart headings (h3, font-bold with CHART_TEXT).
 * It stays a span, since a heading can't sit inside the row's button. */
const GROUP_HEADING = 'font-bold';
/** Axis labels and column headers: the chart collection's axis text (HourSpark, ProfileBars, GapsChart). */
const AXIS_TEXT = 'text-xs text-[var(--text-dim)]';
const AXIS_TICKS = [0, 0.25, 0.5, 0.75, 1] as const;
const DOT = 'absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full';
// Phones: the name sits on its own line above its strip, so the strip gets the width; from sm up it takes a 9rem column,
// unless the chart sits in a narrow column (nameAbove), where the name stays above its strip at every width.
// The number columns are wide enough that their headers ("15 min") clear the axis's last label.
const ROW_GRID_ABOVE = 'grid grid-cols-[1fr_3.5rem_3.5rem] items-center gap-x-3';
const ROW_GRID_BESIDE = `${ROW_GRID_ABOVE} sm:grid-cols-[9rem_1fr_3.5rem_3.5rem]`;
const NAME_CELL_ABOVE = 'col-span-3 min-w-0';
const NAME_CELL_BESIDE = `${NAME_CELL_ABOVE} sm:col-span-1`;
/** Phones and the side-by-side desktop columns label only 0, 50 and 100% (the other gridlines stay), so the axis labels don't run together. */
const tickLabelClass = (tick: number) => (tick === 0.25 || tick === 0.75 ? 'hidden sm:inline lg:hidden' : '');

/** The solid dot and the ring, for the chart's key. With `series`, each item highlights its series the split bar legend's way
 * (SplitBar: hover, focus or tap; tap again to clear), and screen readers hear which one is highlighted. */
export function DotPairKey({ first, second, series }: { first: string; second: string; series?: DotPairSeries }) {
  const items = [
    { key: 'first' as const, label: first, swatch: 'bg-[var(--text-primary)]' },
    { key: 'second' as const, label: second, swatch: 'border-2 border-[var(--text-muted)] bg-[var(--bg-panel)]' },
  ];
  return (
    <>
      <ul className={`flex flex-wrap gap-x-4 gap-y-1 ${CHART_TEXT}`} onMouseLeave={series?.clear}>
        {items.map(item => (
          <li key={item.key} data-active={series?.active === item.key ? 'true' : undefined}
            {...(series ? { tabIndex: 0, 'aria-label': item.label, ...series.partEvents(item.key) } : {})}
            className={`-mx-1.5 inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-0.5 transition-colors ${series ? 'cursor-pointer select-none outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]' : ''}`}
            style={series?.active === item.key ? { background: ACTIVE_BG } : undefined}>
            <span className={`h-3 w-3 rounded-full ${item.swatch}`} aria-hidden="true" />{item.label}
          </li>
        ))}
      </ul>
      {series && <div className="sr-only" aria-live="polite">{items.find(item => item.key === series.active)?.label ?? ''}</div>}
    </>
  );
}

/**
 * CIV-1577: two shares per row on one 0–100% scale, a solid dot and a ring joined by a line, so the gap between them is
 * what reads (the Frequent service story's coverage at 15 and 30 min, per city). Rows are picked the split bar's way
 * (useActivePart): hovering, focusing or tapping a row fades the others and highlights its name. Names, counts and axis use
 * the chart collection's text (CHART_TEXT, CHART_COUNT, and the dim axis text); the numbers sit in two columns at the right, first then second.
 */
export default function DotPairs({ groups, label, details, firstHeader, secondHeader, nameAbove = false, series }: {
  groups: readonly DotPairGroup[];
  /** The chart's accessible name. */
  label: string;
  /** The id(s) of the chart's tables for screen readers (ChartTableDetails), linked with aria-details. */
  details?: string;
  /** The headers over the two number columns (shown once, above the first group). */
  firstHeader: ReactNode;
  secondHeader: ReactNode;
  /** Keep each name on its own line above its strip at every width (for a chart in a narrow column, such as side by side). */
  nameAbove?: boolean;
  /** The highlighted series, shared with the key (DotPairKey); hovering or tapping a column header highlights it too. */
  series?: DotPairSeries;
}) {
  const ROW_GRID = nameAbove ? ROW_GRID_ABOVE : ROW_GRID_BESIDE;
  const NAME_CELL = nameAbove ? NAME_CELL_ABOVE : NAME_CELL_BESIDE;
  const { active, clear, faded, partEvents } = useActivePart();
  return (
    <div role="group" aria-label={label} aria-details={details} className="select-none" onMouseLeave={clear}>
      <div className={`${ROW_GRID} ${AXIS_TEXT}`} aria-hidden="true">
        {!nameAbove && <span className="hidden sm:block" />}
        <span className="relative h-4">
          {AXIS_TICKS.map(tick => (
            <span key={tick} className={`absolute top-0 tabular-nums ${tickLabelClass(tick)} ${tick === 0 ? '' : tick === 1 ? '-translate-x-full' : '-translate-x-1/2'}`} style={{ left: `${tick * 100}%` }}>{percentText(tick)}</span>
          ))}
        </span>
        {([['first', firstHeader], ['second', secondHeader]] as const).map(([key, header]) => (
          // Pointer only: the key's items are the keyboard and screen-reader way in.
          <span key={key} className={`justify-self-end whitespace-nowrap rounded-md transition-colors ${series ? 'cursor-pointer' : ''}`}
            style={series?.active === key ? { background: ACTIVE_BG } : undefined}
            onMouseEnter={series ? () => series.partEvents(key).onMouseEnter() : undefined}
            onMouseLeave={series?.clear}
            onClick={series ? () => series.partEvents(key).onClick() : undefined}>{header}</span>
        ))}
      </div>
      {groups.filter(group => group.pairs.length > 0).map(group => (
        <div key={group.key} className="mt-6 first-of-type:mt-3">
          {group.title && <h3 className={`mb-2 font-bold ${CHART_TEXT}`}>{group.title}</h3>}
          {/* The agency chart's row spacing (RankedBars). */}
          <div className="space-y-3">
            {group.pairs.map(pair => {
              const low = Math.min(pair.first, pair.second);
              const high = Math.max(pair.first, pair.second);
              const isFaded = faded(pair.key);
              // Ryan (CIV-1577): city figures in the regular weight, like the story's table values; only the reference
              // (national) row keeps the chart count weight (CHART_COUNT).
              const valueWeight = pair.reference ? CHART_COUNT : '';
              return (
                <button
                  key={pair.key}
                  type="button"
                  aria-label={pair.sentence}
                  {...partEvents(pair.key)}
                  className={`${ROW_GRID} w-full cursor-pointer rounded-sm border-0 bg-transparent p-0 text-left outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${CHART_TEXT} ${pair.reference ? 'border-b border-solid border-[var(--border-primary)] pb-2' : ''}`}
                >
                  <span className={NAME_CELL}>
                    <span data-active={active === pair.key ? 'true' : undefined} className={`-mx-1.5 inline-block rounded-md px-1.5 py-0.5 leading-4 transition-colors ${pair.reference ? GROUP_HEADING : ''}`}
                      style={active === pair.key ? { background: ACTIVE_BG } : undefined}>{pair.label}</span>
                  </span>
                  <span className="relative block h-4 transition-opacity" style={{ opacity: isFaded ? FADED_OPACITY : undefined }} aria-hidden="true">
                    {AXIS_TICKS.map(tick => <span key={tick} className="absolute inset-y-0 w-px bg-[var(--border-primary)]" style={{ left: `${tick * 100}%` }} />)}
                    <span className={`absolute top-[7px] h-[2px] rounded-full bg-[var(--text-muted)] ${SERIES_PART}`} style={{ ...seriesFade(series, 'line'), left: `${low * 100}%`, width: `${(high - low) * 100}%` }} />
                    <span className={`${DOT} border-2 border-[var(--text-muted)] bg-[var(--bg-panel)] ${SERIES_PART}`} style={{ ...seriesFade(series, 'second'), left: `${pair.second * 100}%` }} />
                    <span className={`${DOT} bg-[var(--text-primary)] ${SERIES_PART}`} style={{ ...seriesFade(series, 'first'), left: `${pair.first * 100}%` }} />
                  </span>
                  <span className={`text-right tabular-nums ${valueWeight} ${SERIES_PART}`} style={seriesFade(series, 'first')}>{percentText(pair.first)}</span>
                  <span className={`text-right tabular-nums ${valueWeight} ${SERIES_PART}`} style={seriesFade(series, 'second')}>{percentText(pair.second)}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
