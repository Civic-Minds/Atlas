import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { decodeStopRuns } from '../../shared/stopRuns';
import { rank, tierOfHeadway } from './sectionColours';

/**
 * #1502, #1505 (CIV-1595): the slowest value of an end of the row's own line that runs in a worse grade than the number the
 * row shows, or undefined. Such an end is under the branch rule's minimum (FREQUENCY_RULES rule 3, D1: 5 stops and 1 km),
 * so no row speaks for it and its row reads the trunk's number, while the section colours (beta) draw it in its own, slower
 * colour: CTA Green's southern ends (every 20 beside "every 10"), GO Lakeshore West's West Harbour–Confederation end.
 *
 * Read from the stops' period values the section colours use (stretchStopPeriodValues, the beta sections file), over the
 * row's own stops only (not the display-only full line), from each end inwards while a stop's grade is worse than the
 * number's. Drop-off-only stops are skipped, as the sections skip their values. Undefined without those values (public).
 */
export function rowShortEndHeadway(d: ShapeProperties, period: TimePeriod, shown: number, mainStops: ReadonlySet<string> | undefined): number | undefined {
  if (!mainStops || mainStops.size === 0 || period === 'all' || period === 'overnight') return undefined;
  const values = decodeStopRuns(d.stretchStopPeriodValues?.[period]);
  const own = d.stopOrder ?? [];
  // The values follow the full line where the row has one (CIV-321 S4), else its own stops.
  const order = d.fullStopOrder && values.length === d.fullStopOrder.length ? d.fullStopOrder : own;
  if (own.length < 2 || values.length === 0 || values.length !== order.length) return undefined;
  const ownStops = new Set(own);
  const dropOffOnly = new Set(d.dropOffOnlyStops ?? []);
  const line = order
    .map((stop, i) => ({ stop, v: values[i] }))
    .filter(({ stop }) => ownStops.has(stop) && !dropOffOnly.has(stop));
  const shownRank = rank(tierOfHeadway(shown));
  // From one end inwards, off the main stretch only, while each stop's grade is worse than the number's.
  const endRun = (stops: ReadonlyArray<{ stop: string; v: number | null }>): number | undefined => {
    let worst: number | undefined;
    let i = 0;
    while (i < stops.length && stops[i].v == null && !mainStops.has(stops[i].stop)) i++; // a terminal with no value of its own
    for (; i < stops.length; i++) {
      const { stop, v } = stops[i];
      if (mainStops.has(stop) || v == null || rank(tierOfHeadway(v)) <= shownRank) break;
      worst = Math.max(worst ?? 0, v);
    }
    return worst;
  };
  const ends = [endRun(line), endRun([...line].reverse())].filter((v): v is number => v != null);
  return ends.length > 0 ? Math.max(...ends) : undefined;
}

/**
 * The main stretch's stops of one direction: the stops every main-stretch row of it serves (FREQUENCY_RULES rule 1: the
 * stops the regular patterns share). Undefined with fewer than two such rows: one row's main stretch has no ends to find
 * (a tail row's line is its tail alone, so tails cannot mark it).
 */
export function mainStretchStops(features: readonly ShapeProperties[]): ReadonlySet<string> | undefined {
  const regular = features.filter(f => f.stretchRole === 'main' && (f.stopOrder?.length ?? 0) > 0);
  if (regular.length < 2) return undefined;
  const [first, ...rest] = regular;
  const sets = rest.map(f => new Set(f.stopOrder));
  return new Set(first.stopOrder!.filter(stop => sets.every(s => s.has(stop))));
}
