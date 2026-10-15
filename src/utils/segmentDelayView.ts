/**
 * Types and small helpers for the Live route analysis (local proof of concept):
 * the analysis output's shape, time bands, sample minimums, rounding and stop names.
 */
import { TIME_PERIODS } from '../../shared/config';

export type SegmentBand = 'all' | 'amPeak' | 'midday' | 'pmPeak' | 'evening';

const periodLabel = (key: SegmentBand) => TIME_PERIODS.find(p => p.key === key)?.label ?? key;

/** Atlas's shared period names (late night and overnight have too few trips to show). */
export const SEGMENT_BAND_OPTIONS: { id: SegmentBand; label: string }[] = [
  { id: 'all', label: 'All day' },
  ...(['amPeak', 'midday', 'pmPeak', 'evening'] as const).map(id => ({ id, label: periodLabel(id) })),
];

/** A stop pair needs at least this many observed trips, over this many days, to be shown. */
export const MIN_SEGMENT_TRIPS = 30;
export const MIN_DAYS = 5;

export interface SegmentBandStat {
  trips: number;
  days: number;
  firstDate: string;
  lastDate: string;
  actualMedianSec: number;
  scheduledMedianSec: number;
  gainedMedianSec: number;
  gainedP90Sec: number;
}

export interface HeadwayBandStat {
  gaps: number;
  days: number;
  scheduledMedianGapSec: number;
  actualMedianGapSec: number;
  withinShare: number;
  excessWaitSec: number | null;
  /** 10th and 90th percentile of actual gaps (8 in 10 fall between). */
  gapP10Sec?: number;
  gapP90Sec?: number;
  /** 10th and 90th percentile of the timetable's gaps. */
  scheduledP10Sec?: number;
  scheduledP90Sec?: number;
}

export interface HeadwayStop {
  stopId: string;
  stopName: string;
  directionId: number;
  terminal?: boolean;
  bands: Partial<Record<string, HeadwayBandStat>>;
  coordinates: [number, number][];
}

export interface SegmentDelaySegment {
  fromStopId: string;
  toStopId: string;
  fromName: string;
  toName: string;
  directionId: number;
  terminal?: boolean;
  bands: Partial<Record<string, SegmentBandStat>>;
  coordinates: [number, number][];
}

export interface SegmentDelayData {
  agency: string;
  route: string;
  generatedAt: string;
  dates: string[];
  directionLabels?: Record<string, string>;
  observations: number;
  segments: SegmentDelaySegment[];
  headways?: HeadwayStop[];
  v2?: { standingStill?: StandingStillStop[] };
}

export interface StandingStillStop {
  stopId: string;
  stopName: string;
  directionId: number;
  terminal?: boolean;
  scheduledTurnback?: boolean;
  nearCarhouse?: boolean;
  coordinates: [number, number][];
  bands: Partial<Record<string, { events: number; days: number; medianSec: number; totalMin: number }>>;
}

/** A stop needs this many stood-still events, on at least MIN_DAYS days, to be shown. */
export const MIN_STILL_EVENTS = 10;

export interface RankedStill {
  stop: StandingStillStop;
  events: number;
  days: number;
}

/** Stops where vehicles stood still 2+ min; planned turn-backs, terminals and carhouses left out. */
export function usableStandingStill(data: SegmentDelayData | null, band: SegmentBand): RankedStill[] {
  const out: RankedStill[] = [];
  for (const stop of data?.v2?.standingStill ?? []) {
    if (stop.terminal || stop.scheduledTurnback || stop.nearCarhouse) continue;
    const b = stop.bands[band];
    if (!b || b.events < MIN_STILL_EVENTS || b.days < MIN_DAYS) continue;
    out.push({ stop, events: b.events, days: b.days });
  }
  return out.sort((a, b) => b.events - a.events);
}

/** Nearest half minute: positions arrive about once a minute, so finer is false precision. */
export function halfMinutes(sec: number): number {
  return Math.round(sec / 30) / 2;
}

/** Half minutes rounded toward zero, for "at least" statements. */
export function halfMinutesDown(sec: number): number {
  return Math.sign(sec) * Math.floor(Math.abs(sec) / 30) / 2;
}

/** TTC writes some stop names in capitals; show them in title case. */
export function tidyStopName(name: string): string {
  if (name !== name.toUpperCase()) return name;
  return name.toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase()).replace(/\bAt\b/g, 'at');
}

const SIDE = /\s+(East|West|North|South) Side$/i;
const SUFFIX = /\s+(St|Ave|Rd|Blvd|Cres|Way)(\s+(East|West|North|South))?$/i;

/**
 * The one place stop names are shortened for the Live card. "King St West at Spadina Ave
 * West Side" gives street "King St", cross "Spadina", short "King & Spadina".
 */
export function stopNameParts(name: string): { street: string; cross: string; short: string } {
  const [rawStreet, rawCross] = tidyStopName(name).split(' at ');
  const street = rawStreet.replace(/\s+(East|West|North|South)$/i, '').trim();
  // Drop a trailing " - Station name" first, then a joined place ("Langley Ave-Bridgepoint ..."), then the side and street type.
  const clean = (x: string) => x.replace(/ - .*$/, '').replace(/-[A-Z].*$/, '').replace(SIDE, '').replace(SUFFIX, '').trim();
  const cross = clean(rawCross ?? rawStreet);
  return { street, cross, short: rawCross ? `${clean(rawStreet)} & ${cross}` : cross };
}
