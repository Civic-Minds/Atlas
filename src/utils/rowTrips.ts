import type { ShapeProperties, TimePeriod } from '../hooks/useIntervalStats';
import { routeCardDisplayHeadway, routeCardPeriodShapeText } from './effectiveHeadway';
import { isOneGapRow } from './stretchCard';

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
 * - A headsign with no service of its own in the period (noOwnServiceByPeriod) reads nothing: the row shows no regular service.
 * - A main or tail row reading its stretch pairs its value with that stretch's longest gap (stretchMeta maxGap, the same pooled
 *   departures; Sun Metro 205's "Mesa Inbound" no longer reads one headsign's 315-minute hole). A row slower than its stretch
 *   reads one branch of it (Phoenix 35's branch rows: 30 over a shared 15) and keeps its own trips' gap.
 * - Otherwise the row's own value and its own longest gap (maxGapByPeriod follows the value's source, #281).
 */
export function rowTrips(d: ShapeProperties, period: TimePeriod): RowTrips {
  if (period === 'all') return { ...NONE, value: routeCardDisplayHeadway(d, period) };
  const key = period as PeriodKey;
  if (d.noOwnServiceByPeriod?.includes(key)) return { ...NONE, noOwnService: true };
  const value = routeCardDisplayHeadway(d, period);
  const slot = stretchSlot(d);
  const slotGap = slot?.maxGap?.[key];
  const slotValue = slot?.period?.[key];
  // A row slower than its stretch reads one branch of it, not the stretch (Phoenix 35: 30 on a shared 15). A row with no value of
  // its own, or on data without the slot's period (public tails: it lives in the sections file), takes its stretch's gap.
  const fromSlot = typeof slotGap === 'number' && (value == null || typeof slotValue !== 'number' || value <= slotValue);
  const ownGap = d.maxGapByPeriod?.[key];
  return {
    value,
    longestGap: fromSlot ? slotGap : typeof ownGap === 'number' ? ownGap : null,
    partPeriod: d.stretchRole === 'main' && !isOneGapRow(d, period) ? routeCardPeriodShapeText(d, period) : undefined,
    noOwnService: false,
  };
}
