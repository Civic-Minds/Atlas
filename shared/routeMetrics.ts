/**
 * Route-level headline measures for the Live dashboard that are not per-stop: running time against the timetable,
 * service delivered, and which days of the archive are healthy enough to count. Pure functions; scripts/live-segment-delay.ts
 * feeds them. The same functions describe this week and last week, so a comparison never mixes two ways of counting.
 */
import { median, percentile } from './segmentDelay.js';

/** A figure needs this many trips before it is shown without fading. */
export const MIN_TRIPS = 30;
/** A day counts only when the archive holds at least this share of the snapshots a normal day has. */
export const HEALTHY_DAY_SHARE = 0.9;
/** A week needs this many healthy days to be compared. */
export const MIN_HEALTHY_DAYS = 4;

export interface RunTimeRow {
  date: string;
  directionId: number;
  /** Hour of day (GTFS, can be 24+) the trip is scheduled to leave its first stop. */
  startHour: number;
  /** Timetable: first-stop departure to last-stop arrival, seconds. */
  schedSec: number;
  /** Measured: the vehicle left the first stop to it reached the last stop, seconds. */
  actualSec: number;
}

export interface RunTimeStat {
  n: number;
  scheduledMin: number;
  typicalMin: number;
  /** 1 in 10 trips take longer than this, minutes. */
  p90Min: number;
  /** Typical minus scheduled, minutes (positive = slower than the timetable). */
  overMin: number;
}

const min1 = (sec: number) => Math.round((sec / 60) * 10) / 10;

export function runTimeStat(rows: readonly RunTimeRow[]): RunTimeStat | null {
  if (rows.length === 0) return null;
  const sched = median(rows.map(r => r.schedSec))!;
  const actual = median(rows.map(r => r.actualSec))!;
  return {
    n: rows.length, scheduledMin: min1(sched), typicalMin: min1(actual),
    p90Min: min1(percentile(rows.map(r => r.actualSec), 0.9)!),
    overMin: min1(median(rows.map(r => r.actualSec - r.schedSec))!),
  };
}

export type TripOutcomeKind = 'seen' | 'not_seen' | 'unknown';
export interface TripOutcome { date: string; directionId: number; outcome: TripOutcomeKind }

export interface Delivered {
  seen: number;
  notSeen: number;
  /** Trips we cannot judge (the feed was down or other cars covered the slot): left out of the share, not counted as missed. */
  unknown: number;
  /** seen / (seen + notSeen); null when nothing is known. */
  share: number | null;
}

/** Service delivered: the share of scheduled trips with a vehicle seen under their number, among trips we can judge. */
export function delivered(rows: readonly TripOutcome[]): Delivered {
  let seen = 0, notSeen = 0, unknown = 0;
  for (const r of rows) {
    if (r.outcome === 'seen') seen++; else if (r.outcome === 'not_seen') notSeen++; else unknown++;
  }
  return { seen, notSeen, unknown, share: seen + notSeen ? seen / (seen + notSeen) : null };
}

export interface DayHealth { date: string; snapshots: number; healthy: boolean }

/** A day is healthy when the archive has at least HEALTHY_DAY_SHARE of the snapshots a typical day has. */
export function dayHealth(snapshotsByDate: ReadonlyMap<string, number>): DayHealth[] {
  const counts = [...snapshotsByDate.values()];
  const typical = counts.length ? median(counts)! : 0;
  return [...snapshotsByDate].sort((a, b) => a[0].localeCompare(b[0])).map(([date, snapshots]) => ({ date, snapshots, healthy: typical > 0 && snapshots >= HEALTHY_DAY_SHARE * typical }));
}

/** The last two weeks of dates (this week = the newest 7, last week = the 7 before), with their healthy days. */
export function weekSplit(dates: readonly string[], health: readonly DayHealth[]): { thisWeek: string[]; lastWeek: string[]; thisHealthy: string[]; lastHealthy: string[] } {
  const sorted = [...dates].sort();
  const thisWeek = sorted.slice(-7);
  const lastWeek = sorted.slice(-14, -7);
  const ok = new Set(health.filter(h => h.healthy).map(h => h.date));
  return { thisWeek, lastWeek, thisHealthy: thisWeek.filter(d => ok.has(d)), lastHealthy: lastWeek.filter(d => ok.has(d)) };
}
