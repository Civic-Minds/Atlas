/**
 * View helpers for "where vehicles lose time" (local Live proof of concept):
 * ranking stop pairs, colouring them with the existing lateness colours, and
 * building the map overlay features.
 */
import { STATUS_COLORS, COLOR_VISION_STATUS_COLORS, type ColorVisionMode } from './colors';

export type SegmentBand = 'all' | 'am' | 'midday' | 'pm' | 'evening';

export const SEGMENT_BAND_OPTIONS: { id: SegmentBand; label: string }[] = [
  { id: 'all', label: 'All day' },
  { id: 'am', label: 'Morning rush' },
  { id: 'midday', label: 'Midday' },
  { id: 'pm', label: 'Afternoon rush' },
  { id: 'evening', label: 'Evening' },
];

/** A stop pair needs at least this many observed trips, over this many days, to be shown. */
export const MIN_SEGMENT_TRIPS = 30;
export const MIN_DAYS = 5;
/** Flag thresholds test raw seconds, not the rounded display value. */
export const LOSS_AMBER_SEC = 30;
export const LOSS_RED_SEC = 60;
export const EWT_AMBER_SEC = 30;
export const EWT_RED_SEC = 90;

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
}

export type SegmentView = 'time' | 'spacing';

/** Nearest half minute: positions arrive about once a minute, so finer is false precision. */
export function halfMinutes(sec: number): number {
  return Math.round(sec / 30) / 2;
}

/** Half minutes rounded toward zero, for "at least" statements. */
export function halfMinutesDown(sec: number): number {
  return Math.sign(sec) * Math.floor(Math.abs(sec) / 30) / 2;
}

export function plural(n: number, word: string): string {
  return `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
}

export function formatMinutes(min: number): string {
  const abs = Math.abs(min);
  const whole = Math.floor(abs);
  const half = abs - whole >= 0.5;
  if (whole === 0 && half) return '½ min';
  return `${whole}${half ? '½' : ''} min`;
}

export interface RankedSegment {
  segment: SegmentDelaySegment;
  stat: SegmentBandStat;
  lostMin: number; // rounded to ½ min; negative = makes up time
}

/** Stop pairs with enough trips, excluding terminal loops (layover isn't delay). */
export function usableSegments(data: SegmentDelayData | null, band: SegmentBand): RankedSegment[] {
  if (!data) return [];
  const out: RankedSegment[] = [];
  for (const segment of data.segments) {
    if (segment.terminal) continue;
    const stat = segment.bands[band];
    if (!stat || stat.trips < MIN_SEGMENT_TRIPS || stat.days < MIN_DAYS) continue;
    out.push({ segment, stat, lostMin: halfMinutes(stat.gainedMedianSec) });
  }
  return out;
}

export function rankSegments(data: SegmentDelayData | null, band: SegmentBand, limit = 5) {
  const usable = usableSegments(data, band);
  const losing = usable.filter(s => s.stat.gainedMedianSec >= LOSS_AMBER_SEC).sort((a, b) => b.stat.gainedMedianSec - a.stat.gainedMedianSec).slice(0, limit);
  // "Looser than needed" only when nearly every pass beats the timetable, not just the typical one.
  const gaining = usable.filter(isPadded).sort((a, b) => a.stat.gainedMedianSec - b.stat.gainedMedianSec).slice(0, 2);
  const trips = usable.reduce((m, s) => Math.max(m, s.stat.trips), 0);
  const days = usable.reduce((m, s) => Math.max(m, s.stat.days), 0);
  return { losing, gaining, trips, days, segmentCount: usable.length };
}

export function isPadded(s: RankedSegment): boolean {
  return s.stat.gainedMedianSec <= -LOSS_AMBER_SEC && s.stat.gainedP90Sec <= 0;
}

/**
 * Existing lateness colours: amber for ½ min lost, the "late" red from 1 min,
 * the "early" blue where the schedule's padding lets vehicles make up time.
 * Stop pairs within ±½ min aren't overlaid (the route line shows through).
 */
export function segmentColor(s: RankedSegment, mode: ColorVisionMode = 'default'): string | null {
  const palette = mode === 'friendly' ? COLOR_VISION_STATUS_COLORS : STATUS_COLORS;
  const sec = s.stat.gainedMedianSec;
  if (sec >= LOSS_RED_SEC) return palette.late.bg;
  if (sec >= LOSS_AMBER_SEC) return mode === 'friendly' ? '#b07a00' : '#f59e0b';
  if (isPadded(s)) return palette.early.bg;
  return null;
}

export function directionLabel(data: SegmentDelayData | null, directionId: number): string {
  return data?.directionLabels?.[String(directionId)] ?? `Direction ${directionId}`;
}

/** TTC writes some stop names in capitals; show them in title case. */
export function tidyStopName(name: string): string {
  if (name !== name.toUpperCase()) return name;
  return name.toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase()).replace(/\bAt\b/g, 'at');
}

/** Minimum gaps (successive vehicles) at a stop before its spacing is shown. */
export const MIN_HEADWAY_GAPS = 30;

export interface RankedHeadway {
  stop: HeadwayStop;
  stat: HeadwayBandStat;
  ewtMin: number; // rounded to ½ min
}

export function usableHeadways(data: SegmentDelayData | null, band: SegmentBand): RankedHeadway[] {
  const out: RankedHeadway[] = [];
  for (const stop of data?.headways ?? []) {
    if (stop.terminal) continue;
    const stat = stop.bands[band];
    if (!stat || stat.gaps < MIN_HEADWAY_GAPS || stat.days < MIN_DAYS || stat.excessWaitSec == null) continue;
    out.push({ stop, stat, ewtMin: halfMinutes(stat.excessWaitSec) });
  }
  return out;
}

/** Existing lateness colours for extra wait: amber from 30 s, red from 90 s. */
export function ewtColor(ewtSec: number | null, mode: ColorVisionMode = 'default'): string | null {
  const palette = mode === 'friendly' ? COLOR_VISION_STATUS_COLORS : STATUS_COLORS;
  if (ewtSec == null) return null;
  if (ewtSec >= EWT_RED_SEC) return palette.late.bg;
  if (ewtSec >= EWT_AMBER_SEC) return mode === 'friendly' ? '#b07a00' : '#f59e0b';
  return null;
}

export function headwayFeatures(data: SegmentDelayData | null, band: SegmentBand, mode: ColorVisionMode = 'default'): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = [];
  for (const { stop, stat, ewtMin } of usableHeadways(data, band)) {
    const color = ewtColor(stat.excessWaitSec, mode);
    if (!color || stop.coordinates.length < 2) continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: stop.coordinates },
      properties: { color, ewtMin, directionId: stop.directionId },
    });
  }
  return features;
}

export function segmentFeatures(
  data: SegmentDelayData | null,
  band: SegmentBand,
  mode: ColorVisionMode = 'default',
): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = [];
  for (const item of usableSegments(data, band)) {
    const { segment, lostMin } = item;
    const color = segmentColor(item, mode);
    if (!color || segment.coordinates.length < 2) continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: segment.coordinates },
      properties: { color, lostMin, directionId: segment.directionId },
    });
  }
  return features;
}
