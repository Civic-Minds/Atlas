import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { PERIOD_COVERAGE_MAX_HEADWAY } from '../../shared/periodEligibility';
import { routeCardDisplayHeadway, routeCardPeriodShapeText, rowReadsPeriodEdge } from './effectiveHeadway';
import { headwayPeriodShape } from './headwayText';
import { isOneGapRow, SHARED_STRETCH_RATIO } from './stretchCard';

type PeriodKey = Exclude<TimePeriod, 'all'>;

/** One card row's reading of a period, every part from the same trips (CIV-1069). */
export interface RowTrips {
  /** The row's own value ("every N"), or null. */
  value: number | null;
  /** The longest gap of the departures `value` reads; null when the data has none for them. */
  longestGap: number | null;
  /** #934 / D6 wording for a main stretch's late start, early end or one gap inside steady service. */
  partPeriod: string | undefined;
  /** The headsign runs under three times itself in the period: its value is other headsigns' (CTA 77 Belmont & Octavia). */
  noOwnService: boolean;
}

const NONE: RowTrips = { value: null, longestGap: null, partPeriod: undefined, noOwnService: false };

/** The stretch slot a main or tail row stands for, from its stretchMeta; null for a variant or data without it. */
function stretchSlot(d: ShapeProperties) {
  if (d.stretchRole === 'main') return d.stretchMeta?.main ?? null;
  if (d.stretchRole === 'tail') return d.stretchMeta?.tails?.[d.stretchIndex ?? 0] ?? null;
  return null;
}

/**
 * #1239 (Ryan, 2026-10-31): a gap goes into a row's words ("every 6 min, with a 25 min gap") only when it is at least this
 * many times the row's usual wait. "every 63 min, with a 66 min gap" (AC Transit 281 AM) isn't worth mentioning.
 */
export const ROW_GAP_WORDS_RATIO = 1.5;

/**
 * #1239 (Ryan, 2026-10-31): a main stretch's row reads the number the filter decides on: its direction's filter value
 * (directionFilterHeadwayByPeriod), one value for the row and the filter (AC Transit 281 AM to NewPark Mall: every 66,
 * where the row read 60 from its own trips). When one gap between buses is what sets that value
 * (a wait over PERIOD_COVERAGE_MAX_HEADWAY, #524) and it is at least ROW_GAP_WORDS_RATIO times the stretch's steady spacing,
 * the row says both: the spacing and the gap ("every 42 min, with a 65 min gap"). Only a steady period on a direction with
 * no tail of its own in it, where the stretch's value is the main stretch's. null otherwise.
 */
function mainFilterReading(d: ShapeProperties, key: PeriodKey): { every: number; gap?: number } | null {
  if (d.stretchRole !== 'main' || d.stretchPeriodSustained?.[key] !== true || d.stretchPeriodOneGap?.[key] === true) return null;
  if (d.stretchPeriodTypical?.[key] != null || d.stretchMeta?.main?.noRegular?.includes(key)) return null;
  if (d.stretchMeta?.tails?.some(t => t.period?.[key] != null)) return null;
  const every = d.stretchPeriodHeadway?.[key];
  if (typeof every !== 'number') return null;
  // The stretch's spacing counts every trip at its stop: the row reads it only when its own trips are all of them (SEPTA 19
  // Saturday midday: two destinations every 120 on a stretch every 63 keep their own), and a period with a late start or
  // early end keeps its own reading (A2).
  const ownTrips = Object.values(d.departuresByHour ?? {}).reduce((sum, n) => sum + n, 0);
  if (ownTrips !== d.stretchMeta?.main?.trips || rowReadsPeriodEdge(d, key)) return null;
  const filter = d.directionFilterHeadwayByPeriod?.[key];
  const gap = d.stretchMeta?.main?.maxGap?.[key];
  if (typeof filter !== 'number') return null;
  const gapSetsFilter = filter > PERIOD_COVERAGE_MAX_HEADWAY && filter > every && gap === filter;
  // A filter value over the limit that no gap between buses explains is the full-period wait of service that starts late or
  // stops early (settled rule 3, #1268: AC Transit 22 Sunday midday, every 30 then nothing, 168). Data with the branch's edge
  // (CIV-1241) on a row that covers it (#1276) words it before this (TTC 110 weekday PM via 30th Street: "every 30 until 5:55 PM"); without it, the row reads the stretch's steady spacing there
  // ("every 30"), never a bare "every 168", and never its own faster trips.
  if (filter > PERIOD_COVERAGE_MAX_HEADWAY && filter > every && !gapSetsFilter) return { every };
  return gapSetsFilter && gap >= every * ROW_GAP_WORDS_RATIO ? { every, gap } : { every: filter };
}

/**
 * One row's value, longest gap and part-period words for a period, all from the trips the value reads (CIV-1069).
 * - A headsign with no service of its own in the period (noOwnServiceByPeriod) reads nothing: the row shows Irregular.
 * - A period that is not steady for the row's own trips reads its stretch's value where the stretch runs regularly and is not
 *   materially better than the row's own trips (a short burst never takes the stretch's number), else its own value on a
 *   stretch, or its full-window wait off one, unless a main stretch's words (late start, early end, one gap) say it.
 * - A main or tail row whose value is its stretch's pairs it with that stretch's longest gap (stretchMeta maxGap, the same pooled
 *   departures; Sun Metro 205's "Mesa Inbound" no longer reads one headsign's 315-minute hole). A row with a value of its own,
 *   faster or slower than its stretch (NYCT R late; Phoenix 35's branch rows), keeps its own trips' gap.
 * - Otherwise the row's own value and its own longest gap (maxGapByPeriod follows the value's source, #281).
 */
export function rowTrips(d: ShapeProperties, period: TimePeriod, opts: { ownTrips?: boolean } = {}): RowTrips {
  if (period === 'all') return { ...NONE, value: routeCardDisplayHeadway(d, period) };
  const key = period as PeriodKey;
  if (d.noOwnServiceByPeriod?.includes(key)) return { ...NONE, noOwnService: true };
  let partPeriod = (d.stretchRole === 'main' || rowReadsPeriodEdge(d, period)) && !isOneGapRow(d, period) ? routeCardPeriodShapeText(d, period) : undefined;
  let value = routeCardDisplayHeadway(d, period);
  // ownTrips: the card's shared and pooled rows compare the rows' own trips with the stretch's, so they stay as they are
  // (SEPTA 19 Saturday midday keeps "Shared stretch every 63" over its two destinations every 120).
  const filterReading = partPeriod == null && value != null && !opts.ownTrips ? mainFilterReading(d, key) : null;
  if (filterReading) {
    value = filterReading.every;
    if (filterReading.gap != null) partPeriod = headwayPeriodShape(filterReading);
  }
  const slot = stretchSlot(d);
  const slotGap = slot?.maxGap?.[key];
  const slotValue = slot?.period?.[key];
  // CIV-1074 2a: a period that is not steady for the row's own trips reads the trips its riders get. A main or tail row on a
  // stretch with regular service reads the stretch (CTA 9 Ashland & 95th midday: every 10 at 74th-95th, where its own 8 trips
  // start at 13:04); any other row reads its full-window wait (the settled rule, #567-#571), not the median of its gaps.
  const unsteady = value != null && !partPeriod && !filterReading && d.headwayByPeriodSustained?.[key] === false;
  const wait = d.periodCoverageHeadway?.[key];
  if (unsteady && typeof slotValue === 'number' && !slot?.noRegular?.includes(key)) {
    // A short burst can't take the shared stretch's number. Where the stretch is materially better than the row's own trips
    // (by the card's Combined rule's ratio, which then shows a "Shared stretch every N" row), the burst rides on other trips and the row
    // keeps its own value: SEPTA 66 PM, 7 Express trips every 12 on locals every 12, pooled 6; TTC 63 AM, 63B to St Clair every 9
    // from 7:07 on a stretch of 5. Otherwise the row's trips are the stretch's (CTA 9: 13 on its own trips, every 10 at
    // 74th-95th; TTC 25: 6 and 5).
    if (slotValue > value! * SHARED_STRETCH_RATIO) value = slotValue;
  } else if (unsteady && typeof wait === 'number' && wait > value!) value = wait;
  // The stretch's gap goes with the stretch's value: a row with a value of its own, faster (NYCT R late: 13 beside the
  // stretch's 165, CIV-1074 2c) or slower (Phoenix 35: 30 on a shared 15), keeps its own trips' gap. A row with no value of its
  // own, or on data without the slot's period (public tails: it lives in the sections file), takes its stretch's gap.
  const fromSlot = typeof slotGap === 'number' && (value == null || typeof slotValue !== 'number' || value === slotValue);
  const ownGap = d.maxGapByPeriod?.[key];
  return {
    value,
    longestGap: fromSlot ? slotGap : typeof ownGap === 'number' ? ownGap : null,
    partPeriod,
    noOwnService: false,
  };
}
