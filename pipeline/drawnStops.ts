import { HEADLINE_WINDOWS, MIN_ALL_DAY_TERMINAL_DEPARTURES } from './headway-utils.js';
import { BURST_MAX_SPAN_MINUTES } from './transit-phase2.js';

/**
 * CIV-994: which of a line's drawn stops count, in one place. A drop-off-only stop (#879: every own stop time is
 * pickup_type 1) has arrivals, not departures a rider can take, so the shared pool leaves its times out.
 */

/** The drawn stops a rider can board at: drop-off-only stops left out (tier grading, #879). */
export function boardableDrawnStops(drawn: readonly string[], dropOffOnly: ReadonlySet<string>): string[] {
  return drawn.filter(stopId => !dropOffOnly.has(stopId));
}

/**
 * The drawn stops before the terminal: the last stop left out, and with it the drop-off-only stops that run up to it.
 * A terminal drawn twice, platform then parent station, would otherwise keep one copy (#1116: MBTA 71 to Harvard read a
 * 135-minute AM gap at platform 76124 while all 91 trips run every 9 to 14). A drop-off-only stop with a boardable stop
 * after it, other than the terminal, is kept.
 */
export function drawnStopsBeforeTerminal(drawn: readonly string[], dropOffOnly: ReadonlySet<string>): string[] {
  let end = drawn.length - 1;
  while (end > 0 && dropOffOnly.has(drawn[end - 1]) && drawn.slice(end).every(stopId => dropOffOnly.has(stopId) || stopId === drawn[drawn.length - 1])) end--;
  return drawn.slice(0, Math.max(end, 0));
}

/**
 * CIV-209: what one drawn stop can tell the line, answered in one place. Three answers, each kept as it was where it
 * was decided before (a pure move; the rules themselves are unchanged):
 * - boards: a rider can board there (not one of the drawn shape's drop-off-only stops, #879, CIV-1011 #6).
 * - hasReading: at least MIN_ALL_DAY_TERMINAL_DEPARTURES unique departures over the 6-22h headline window, a count
 *   only, with no burst, window or sustained-median test (CIV-150). The headline and period floors and the #865
 *   sibling-terminal test read this.
 * - gradeable: boards and hasReading (CIV-1071 step A). The stop grades read this.
 * - bunched: its 6-22h departures all fall within BURST_MAX_SPAN_MINUTES, the burst test the stop grade applies too.
 * - countsInFloor: boards, hasReading and not bunched (CIV-209, Ryan's option 1 as scoped on review): the stops that
 *   can hold a route's headline down. A drop-off-only stop or a handful of departures bunched into one burst no longer
 *   does; a sparse stop with holes still does, since leaving it out overstated service (ART 45, TARTA 18).
 */
export interface StopReading {
  boards: boolean;
  hasReading: boolean;
  gradeable: boolean;
  bunched: boolean;
  countsInFloor: boolean;
}

export interface StopReadingInput {
  /** The stop's departure times (minutes after midnight) in the list the line reads: pooled where pooled. */
  times: readonly number[] | undefined;
  /** The drawn shape's drop-off-only stops. */
  dropOffOnly: ReadonlySet<string>;
}

export function stopReading(stopId: string, { times, dropOffOnly }: StopReadingInput): StopReading {
  const boards = !dropOffOnly.has(stopId);
  const daytime = [...new Set(times ?? [])].filter(t => t >= HEADLINE_WINDOWS.allDay.start && t <= HEADLINE_WINDOWS.allDay.end);
  const hasReading = daytime.length >= MIN_ALL_DAY_TERMINAL_DEPARTURES;
  const sorted = daytime.sort((a, b) => a - b);
  const bunched = sorted.length > 0 && sorted[sorted.length - 1] - sorted[0] <= BURST_MAX_SPAN_MINUTES;
  return { boards, hasReading, gradeable: boards && hasReading, bunched, countsInFloor: boards && hasReading && !bunched };
}
