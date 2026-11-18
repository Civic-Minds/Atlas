/**
 * Atlas Studio time-loss report (CIV-1683): where a route loses time, stop to stop, ranked, from one
 * live-segment-delay output. Pure; scripts/live-time-loss-report.ts writes it to JSON and markdown.
 *
 * Every rule is the Live card's (docs/GLOSSARY.md "## Live", "typical extra running time" and "the 1-in-10"):
 * - a stop pair needs MIN_SEGMENT_TRIPS passes over MIN_DAYS days in the band;
 * - stop pairs touching a main pattern end (`terminal`) are left out;
 * - a stop pair is listed only from 30 s typical extra running time; amber from 30 s, red from 60 s, on raw seconds;
 * - typical value rounded to nearest ½ min, the 1-in-10 rounded down, shown only when greater than the typical value;
 * - "looser than needed": typical (median) at least 30 s under the timetable, at most 2 listed (no percentile test, Ryan 2026-11-17).
 */
import { directionBranchFallback } from '../../shared/headsignDisplay';
import { MIN_DAYS, MIN_SEGMENT_TRIPS, halfMinutes, halfMinutesDown, tidyStopName, type SegmentBand, type SegmentDelayData, type SegmentDelaySegment } from './segmentDelayView';

/** The Live card's bands, in its order. */
export const TIME_LOSS_BANDS: readonly SegmentBand[] = ['all', 'amPeak', 'midday', 'pmPeak', 'evening'];
/** Listed from, and amber from (raw seconds). */
export const TIME_LOSS_LIST_FROM_SEC = 30;
/** Red from (raw seconds). */
export const TIME_LOSS_RED_FROM_SEC = 60;
/** "Looser than needed": typical at or below this. */
export const LOOSER_AT_OR_BELOW_SEC = -30;
export const LOOSER_MAX_LISTED = 2;

export interface TimeLossRow {
  fromStopId: string;
  toStopId: string;
  /** Stop names as the card shows them (tidyStopName). */
  fromName: string;
  toName: string;
  /** Raw seconds: median of (actual minus scheduled). */
  typicalSec: number;
  /** Nearest ½ min. */
  typicalMin: number;
  /** Raw seconds: nearest-rank 90th percentile of (actual minus scheduled). */
  p90Sec: number;
  /** Rounded down to ½ min. */
  p90MinDown: number;
  /** Kept in the data; no longer shown (Live shows no percentiles, Ryan 2026-11-17). */
  showP90: boolean;
  level: 'amber' | 'red' | 'looser';
  passes: number;
  days: number;
  firstDate: string;
  lastDate: string;
  scheduledMedianSec: number;
  actualMedianSec: number;
}

export interface TimeLossDirection {
  directionId: number;
  label: string;
  /** Ranked by typical extra running time, largest first. */
  slower: TimeLossRow[];
  /** "Looser than needed", most room first, at most LOOSER_MAX_LISTED. */
  looser: TimeLossRow[];
  /** Stop pairs measured in this band with enough passes and days, ends left out (the ones the ranking looked at). */
  measured: number;
  /** Stop pairs left out for too few passes or days. */
  tooFewPasses: number;
  /** Stop pairs left out because they touch a main pattern end. */
  patternEnds: number;
}

export interface TimeLossReport {
  schema: 1;
  agency: string;
  route: string;
  dates: string[];
  rules: { minPasses: number; minDays: number; listFromSec: number; redFromSec: number };
  bands: Partial<Record<SegmentBand, TimeLossDirection[]>>;
}

function row(seg: SegmentDelaySegment, band: SegmentBand, level: TimeLossRow['level']): TimeLossRow {
  const b = seg.bands[band]!;
  const typicalMin = halfMinutes(b.gainedMedianSec);
  const p90MinDown = halfMinutesDown(b.gainedP90Sec);
  return {
    fromStopId: seg.fromStopId, toStopId: seg.toStopId, fromName: tidyStopName(seg.fromName), toName: tidyStopName(seg.toName),
    typicalSec: b.gainedMedianSec, typicalMin, p90Sec: b.gainedP90Sec, p90MinDown, showP90: p90MinDown > typicalMin,
    level, passes: b.trips, days: b.days, firstDate: b.firstDate, lastDate: b.lastDate,
    scheduledMedianSec: b.scheduledMedianSec, actualMedianSec: b.actualMedianSec,
  };
}

export function timeLossReport(data: SegmentDelayData, bands: readonly SegmentBand[] = TIME_LOSS_BANDS): TimeLossReport {
  const directions = [...new Set(data.segments.map(s => s.directionId))].sort((a, b) => a - b);
  const out: TimeLossReport['bands'] = {};
  for (const band of bands) {
    const perDir: TimeLossDirection[] = [];
    for (const d of directions) {
      const dir: TimeLossDirection = { directionId: d, label: directionBranchFallback(d, data.directionLabels?.[String(d)]), slower: [], looser: [], measured: 0, tooFewPasses: 0, patternEnds: 0 };
      for (const seg of data.segments) {
        if (seg.directionId !== d) continue;
        const b = seg.bands[band];
        if (!b) continue;
        if (seg.terminal) { dir.patternEnds++; continue; }
        if (b.trips < MIN_SEGMENT_TRIPS || b.days < MIN_DAYS) { dir.tooFewPasses++; continue; }
        dir.measured++;
        if (b.gainedMedianSec >= TIME_LOSS_LIST_FROM_SEC) dir.slower.push(row(seg, band, b.gainedMedianSec >= TIME_LOSS_RED_FROM_SEC ? 'red' : 'amber'));
        else if (b.gainedMedianSec <= LOOSER_AT_OR_BELOW_SEC) dir.looser.push(row(seg, band, 'looser'));
      }
      dir.slower.sort((x, y) => y.typicalSec - x.typicalSec || y.p90Sec - x.p90Sec || y.passes - x.passes || x.fromStopId.localeCompare(y.fromStopId));
      dir.looser.sort((x, y) => x.typicalSec - y.typicalSec || y.passes - x.passes || x.fromStopId.localeCompare(y.fromStopId));
      dir.looser = dir.looser.slice(0, LOOSER_MAX_LISTED);
      perDir.push(dir);
    }
    out[band] = perDir;
  }
  return {
    schema: 1, agency: data.agency, route: data.route, dates: data.dates,
    rules: { minPasses: MIN_SEGMENT_TRIPS, minDays: MIN_DAYS, listFromSec: TIME_LOSS_LIST_FROM_SEC, redFromSec: TIME_LOSS_RED_FROM_SEC },
    bands: out,
  };
}

/**
 * CIV-1828: each measured stop pair's typical extra running time (raw seconds) in one band and direction, keyed
 * "from>to": what the "Falls behind" map colours by. The report's own rules: enough passes and days, pattern ends left out.
 */
export function timeLossBySegment(data: SegmentDelayData, band: SegmentBand, directionId: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const seg of data.segments) {
    if (seg.directionId !== directionId || seg.terminal) continue;
    const b = seg.bands[band];
    if (!b || b.trips < MIN_SEGMENT_TRIPS || b.days < MIN_DAYS) continue;
    out.set(`${seg.fromStopId}>${seg.toStopId}`, b.gainedMedianSec);
  }
  return out;
}

/** One row of the "falls behind" list, with the route and direction it belongs to. */
export interface TimeLossListRow { route: string; directionId: number; row: TimeLossRow }

/**
 * CIV-1828: the rows of several routes' reports in one band, ranked as the report ranks them (largest typical extra
 * running time first), and the "looser than needed" rows (most room first), each cut to `max`.
 */
export function rankedTimeLoss(reports: ReadonlyMap<string, TimeLossReport>, band: SegmentBand, max: number): { slower: TimeLossListRow[]; looser: TimeLossListRow[] } {
  const slower: TimeLossListRow[] = [];
  const looser: TimeLossListRow[] = [];
  for (const [route, r] of reports) for (const d of r.bands[band] ?? []) {
    for (const row of d.slower) slower.push({ route, directionId: d.directionId, row });
    for (const row of d.looser) looser.push({ route, directionId: d.directionId, row });
  }
  slower.sort((x, y) => y.row.typicalSec - x.row.typicalSec || y.row.p90Sec - x.row.p90Sec || x.route.localeCompare(y.route, undefined, { numeric: true }));
  looser.sort((x, y) => x.row.typicalSec - y.row.typicalSec || x.route.localeCompare(y.route, undefined, { numeric: true }));
  return { slower: slower.slice(0, max), looser: looser.slice(0, max) };
}
