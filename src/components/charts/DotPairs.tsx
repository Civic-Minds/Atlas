import type { Key, ReactNode } from 'react';
import { percentText } from '../../../shared/numberText';
import { ACTIVE_BG, CHART_COUNT, CHART_TEXT, FADED_OPACITY, useActivePart } from './useActivePart';

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
  /** The group's name, above its rows. */
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
// Phones: the name sits on its own line above its strip, so the strip gets the width; from sm up it takes a 9rem column.
const ROW_GRID = 'grid grid-cols-[1fr_2.75rem_2.75rem] items-center gap-x-3 sm:grid-cols-[9rem_1fr_2.75rem_2.75rem]';
const NAME_CELL = 'col-span-3 min-w-0 sm:col-span-1';
/** Phones label only 0, 50 and 100% (the other gridlines stay), so the axis labels don't run together. */
const tickLabelClass = (tick: number) => (tick === 0.25 || tick === 0.75 ? 'hidden sm:inline' : '');

/** The solid dot and the ring, for the chart's key. */
export function DotPairKey({ first, second }: { first: ReactNode; second: ReactNode }) {
  return (
    <div className={`flex flex-wrap gap-x-5 gap-y-1 ${CHART_TEXT}`}>
      <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-[var(--text-primary)]" aria-hidden="true" />{first}</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border-2 border-[var(--text-muted)] bg-[var(--bg-panel)]" aria-hidden="true" />{second}</span>
    </div>
  );
}

/**
 * CIV-1577: two shares per row on one 0–100% scale, a solid dot and a ring joined by a line, so the gap between them is
 * what reads (the Frequent service story's coverage at 15 and 30 min, per city). Rows are picked the split bar's way
 * (useActivePart): hovering, focusing or tapping a row fades the others and highlights its name. Names, counts and axis use
 * the chart collection's text (CHART_TEXT, CHART_COUNT, and the dim axis text); the numbers sit in two columns at the right, first then second.
 */
export default function DotPairs({ groups, label, details, firstHeader, secondHeader }: {
  groups: readonly DotPairGroup[];
  /** The chart's accessible name. */
  label: string;
  /** The id(s) of the chart's tables for screen readers (ChartTableDetails), linked with aria-details. */
  details?: string;
  /** The headers over the two number columns (shown once, above the first group). */
  firstHeader: ReactNode;
  secondHeader: ReactNode;
}) {
  const { active, clear, faded, partEvents } = useActivePart();
  return (
    <div role="group" aria-label={label} aria-details={details} className="select-none" onMouseLeave={clear}>
      <div className={`${ROW_GRID} ${AXIS_TEXT}`} aria-hidden="true">
        <span className="hidden sm:block" />
        <span className="relative h-4">
          {AXIS_TICKS.map(tick => (
            <span key={tick} className={`absolute top-0 tabular-nums ${tickLabelClass(tick)} ${tick === 0 ? '' : tick === 1 ? '-translate-x-full' : '-translate-x-1/2'}`} style={{ left: `${tick * 100}%` }}>{percentText(tick)}</span>
          ))}
        </span>
        <span className="whitespace-nowrap text-right">{firstHeader}</span>
        <span className="whitespace-nowrap text-right">{secondHeader}</span>
      </div>
      {groups.map(group => (
        <div key={group.key} className="mt-6 first-of-type:mt-3">
          {group.title && <h3 className={`mb-2 font-bold ${CHART_TEXT}`}>{group.title}</h3>}
          <div className="space-y-1">
            {group.pairs.map(pair => {
              const low = Math.min(pair.first, pair.second);
              const high = Math.max(pair.first, pair.second);
              const isFaded = faded(pair.key);
              return (
                <button
                  key={pair.key}
                  type="button"
                  aria-label={pair.sentence}
                  {...partEvents(pair.key)}
                  className={`${ROW_GRID} w-full cursor-pointer rounded-sm border-0 bg-transparent py-1 text-left outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${CHART_TEXT} ${pair.reference ? 'border-b border-solid border-[var(--border-primary)] pb-2' : ''}`}
                >
                  <span className={NAME_CELL}>
                    <span data-active={active === pair.key ? 'true' : undefined} className={`-mx-1.5 inline-block rounded-md px-1.5 py-0.5 leading-4 transition-colors ${pair.reference ? GROUP_HEADING : ''}`}
                      style={active === pair.key ? { background: ACTIVE_BG } : undefined}>{pair.label}</span>
                  </span>
                  <span className="relative block h-4 transition-opacity" style={{ opacity: isFaded ? FADED_OPACITY : undefined }} aria-hidden="true">
                    {AXIS_TICKS.map(tick => <span key={tick} className="absolute inset-y-0 w-px bg-[var(--border-primary)]" style={{ left: `${tick * 100}%` }} />)}
                    <span className="absolute top-[7px] h-[2px] rounded-full bg-[var(--text-muted)]" style={{ left: `${low * 100}%`, width: `${(high - low) * 100}%` }} />
                    <span className={`${DOT} border-2 border-[var(--text-muted)] bg-[var(--bg-panel)]`} style={{ left: `${pair.second * 100}%` }} />
                    <span className={`${DOT} bg-[var(--text-primary)]`} style={{ left: `${pair.first * 100}%` }} />
                  </span>
                  <span className={`text-right tabular-nums ${CHART_COUNT}`}>{percentText(pair.first)}</span>
                  <span className={`text-right tabular-nums ${CHART_COUNT}`}>{percentText(pair.second)}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
