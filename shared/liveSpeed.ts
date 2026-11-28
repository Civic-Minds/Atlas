/**
 * CIV-2919: Speed, the average speed of a route's recorded trips by stretch and time of day (Ryan's method pick: average speed
 * by time of day, no baseline). A stretch is consecutive stops merged until it is at least SPEED_MINIMUMS.stretchM long. Each
 * traversal runs from leaving its first stop (DEPARTURE_OFFSET_M past it) to reaching its last, so a trip's time at the first
 * stop isn't counted and its time at the stops along the stretch is. The traversals (start time and duration, no vehicle ids)
 * are the private file; summarizeSpeed builds the only figures a reader sees from them.
 */
import { DAYTIME_PERIOD_KEYS, type DaytimePeriodKey } from './rules/periods.js';
import { SPEED_MINIMUMS } from './rules/live.js';
import { bandForHour, stopPassages, type Pattern, type Projected, SEGMENT_DEFAULTS } from './segmentDelay.js';

/** One stretch of a pattern: pattern stop indexes from and to, and its length along the shape (metres). */
export interface SpeedStretch {
  fromStopId: string;
  toStopId: string;
  directionId: number;
  metres: number;
}

/** One recorded trip over one stretch: when it left the first stop (epoch seconds), how long it took, and its service date. */
export interface SpeedTraversal {
  key: string;
  departT: number;
  sec: number;
  date: string;
}

export const speedStretchKey = (s: Pick<SpeedStretch, 'directionId' | 'fromStopId' | 'toStopId'>) => `${s.directionId}|${s.fromStopId}|${s.toStopId}`;

/**
 * A pattern's stretches: from its first stop, the fewest consecutive stops that reach SPEED_MINIMUMS.stretchM, then the next
 * from where that one ends. A short remainder at the end joins the last stretch. A pattern shorter than the minimum has none.
 */
export function speedStretches(pattern: Pattern, offsetM: number, minM: number = SPEED_MINIMUMS.stretchM): SpeedStretch[] {
  const stops = pattern.stops;
  const out: { from: number; to: number }[] = [];
  let i = 0;
  for (let j = 1; j < stops.length; j++) {
    // Measured as the traversal runs: from leaving stop i (offsetM past it) to reaching stop j.
    if (stops[j].along - (stops[i].along + offsetM) >= minM) { out.push({ from: i, to: j }); i = j; }
  }
  if (out.length && i < stops.length - 1) out[out.length - 1].to = stops.length - 1;
  return out.map(({ from, to }) => ({
    fromStopId: stops[from].stopId,
    toStopId: stops[to].stopId,
    directionId: pattern.directionId,
    metres: stops[to].along - (stops[from].along + offsetM),
  }));
}

/** The stretches one run crossed whole within one unbroken leg: left the first stop (offset past it) and reached the last. */
export function speedTraversals(projected: Projected[], pattern: Pattern, stretches: readonly SpeedStretch[], date: string, offsetM: number): SpeedTraversal[] {
  const arrivals = stopPassages(projected, pattern, SEGMENT_DEFAULTS, 0);
  const departures = stopPassages(projected, pattern, SEGMENT_DEFAULTS, offsetM);
  const out: SpeedTraversal[] = [];
  // Both lists split the run into the same legs (the split doesn't depend on the offset).
  for (let leg = 0; leg < Math.min(arrivals.length, departures.length); leg++) {
    const left = new Map(departures[leg].map(p => [p.stopId, p.t]));
    const reached = new Map(arrivals[leg].map(p => [p.stopId, p.t]));
    for (const s of stretches) {
      const a = left.get(s.fromStopId), b = reached.get(s.toStopId);
      if (a == null || b == null || b <= a) continue;
      out.push({ key: speedStretchKey(s), departT: Math.round(a), sec: Math.round(b - a), date });
    }
  }
  return out;
}

const isWeekday = (date: string) => { const d = new Date(`${date}T12:00:00Z`).getUTCDay(); return d >= 1 && d <= 5; };

export interface SpeedStretchSummary extends SpeedStretch {
  /** Average speed (km/h) per time-of-day slot: the slot's total distance over its total time. Null below a minimum. */
  kmh: Record<DaytimePeriodKey, number | null>;
  trips: Record<DaytimePeriodKey, number>;
  weekdays: number;
  totalTrips: number;
  /** Why the whole stretch shows no figure, if it doesn't. */
  notMeasured?: 'length' | 'weekdays' | 'trips';
}

/**
 * The Speed figures: weekday traversals only, by the shared time-of-day periods (agency-local hour from `hourOf`). A stretch
 * below a minimum shows nothing; a slot below its own minimum shows nothing in that slot.
 */
export function summarizeSpeed(stretches: readonly SpeedStretch[], traversals: readonly SpeedTraversal[], hourOf: (epochSec: number) => number): SpeedStretchSummary[] {
  const byKey = new Map<string, SpeedTraversal[]>();
  for (const t of traversals) if (isWeekday(t.date)) (byKey.get(t.key) ?? byKey.set(t.key, []).get(t.key)!).push(t);
  const seen = new Set<string>();
  const out: SpeedStretchSummary[] = [];
  for (const s of stretches) {
    const key = speedStretchKey(s);
    if (seen.has(key)) continue;
    seen.add(key);
    const list = byKey.get(key) ?? [];
    const weekdays = new Set(list.map(t => t.date)).size;
    const slotSec = Object.fromEntries(DAYTIME_PERIOD_KEYS.map(k => [k, [] as number[]])) as Record<DaytimePeriodKey, number[]>;
    for (const t of list) {
      const band = bandForHour(hourOf(t.departT));
      if ((DAYTIME_PERIOD_KEYS as readonly string[]).includes(band)) slotSec[band as DaytimePeriodKey].push(t.sec);
    }
    const trips = Object.fromEntries(DAYTIME_PERIOD_KEYS.map(k => [k, slotSec[k].length])) as Record<DaytimePeriodKey, number>;
    const notMeasured = s.metres < SPEED_MINIMUMS.stretchM ? 'length' as const
      : weekdays < SPEED_MINIMUMS.weekdays ? 'weekdays' as const
      : list.length < SPEED_MINIMUMS.trips ? 'trips' as const : undefined;
    const kmh = Object.fromEntries(DAYTIME_PERIOD_KEYS.map(k => {
      const secs = slotSec[k];
      if (notMeasured || secs.length < SPEED_MINIMUMS.tripsPerSlot) return [k, null];
      const total = secs.reduce((a, b) => a + b, 0);
      return [k, Math.round((s.metres * secs.length / total) * 3.6 * 10) / 10];
    })) as Record<DaytimePeriodKey, number | null>;
    out.push({ ...s, kmh, trips, weekdays, totalTrips: list.length, ...(notMeasured ? { notMeasured } : {}) });
  }
  return out;
}
