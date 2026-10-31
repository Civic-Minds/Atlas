import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { routeCardDisplayHeadway, routeCardPeriodShapeText } from './effectiveHeadway';
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
export function rowTrips(d: ShapeProperties, period: TimePeriod): RowTrips {
  if (period === 'all') return { ...NONE, value: routeCardDisplayHeadway(d, period) };
  const key = period as PeriodKey;
  if (d.noOwnServiceByPeriod?.includes(key)) return { ...NONE, noOwnService: true };
  const partPeriod = d.stretchRole === 'main' && !isOneGapRow(d, period) ? routeCardPeriodShapeText(d, period) : undefined;
  let value = routeCardDisplayHeadway(d, period);
  const slot = stretchSlot(d);
  const slotGap = slot?.maxGap?.[key];
  const slotValue = slot?.period?.[key];
  // CIV-1074 2a: a period that is not steady for the row's own trips reads the trips its riders get. A main or tail row on a
  // stretch with regular service reads the stretch (CTA 9 Ashland & 95th midday: every 10 at 74th-95th, where its own 8 trips
  // start at 13:04); any other row reads its full-window wait (the settled rule, #567-#571), not the median of its gaps.
  const unsteady = value != null && !partPeriod && d.headwayByPeriodSustained?.[key] === false;
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
