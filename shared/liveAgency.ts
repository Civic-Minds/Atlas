/**
 * Live agency dashboard (CIV-262): one page for a whole agency, built from the route analysis files (`v3` blocks) of the
 * routes that have one. Network figures are weighted by what was measured (departures, trips, gaps), never averaged per
 * route, so a quiet route does not count as much as the 504. Every figure says how many of the agency's routes it covers.
 * Pure: the builder script (scripts/live-agency-summary.ts) reads the files, this turns them into the page's numbers.
 */
import { rankStops, type LiveV3, type UncertainStart, type WeekMetrics } from './liveDashboard.js';

/** Stops and stretches need this many measurements to be ranked (the route page's rule). */
export const AGENCY_MIN_N = 30;
/** Worst stops: no more than this many from one route direction. */
export const STOPS_PER_DIRECTION = 3;

export interface AgencyRouteInput {
  route: string;
  /** Route name as the route page shows it ("504 — King"). */
  label: string;
  /** The route as a page title names it ("504 King"). */
  titleLabel?: string;
  /** GTFS route_type and route_long_name, for the routes table (grouped by mode, the agency pages' name cell). */
  mode?: number;
  longName?: string | null;
  v3: LiveV3;
  uncertainStart?: readonly UncertainStart[];
}

export interface AgencyRouteRow {
  route: string;
  label: string;
  titleLabel?: string;
  mode?: number;
  longName?: string | null;
  lateShare: number | null;
  lateN: number;
  lateLastWeek: number | null;
  /** Running time over the timetable, as a share of the scheduled time (0.06 = 6% longer). */
  runTimeOver: number | null;
  bunchingShare: number | null;
  deliveredShare: number | null;
  /** Late share by hour of day, all days, at timepoints. */
  lateByHour: Array<{ hour: number; value: number; n: number }>;
}

export interface AgencyHotspotStop { route: string; routeLabel: string; stopId: string; name: string; directionId: number; direction: string; lateShare: number; medianMin: number; p90Min: number; n: number; lat?: number; lon?: number }
export interface AgencyHotspotStretch { route: string; routeLabel: string; directionId: number; direction: string; fromStopId: string; toStopId: string; fromName: string; toName: string; value: number; n: number; from?: [number, number]; to?: [number, number] }

export interface AgencySummary {
  schema: 1;
  agency: string;
  generatedAt: string;
  /** Routes in the agency's timetable, and the routes this page covers (held routes are listed, not counted). */
  totalRoutes: number;
  covered: string[];
  held: Array<{ route: string }>;
  weekly: { thisWeek: WeekMetrics; lastWeek: WeekMetrics; comparable: boolean; minHealthyDays: number } | null;
  /** Network late share per day of this week (days with good recordings), for the change's noise. */
  daily: { late: number[]; delivered: number[] };
  routes: AgencyRouteRow[];
  worstStops: AgencyHotspotStop[];
  delayStarts: AgencyHotspotStretch[];
  bunchingForms: AgencyHotspotStretch[];
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

/** One week across routes, each figure weighted by its own sample (departures, trips, gaps). */
export function combineWeeks(weeks: readonly WeekMetrics[]): WeekMetrics {
  const dates = [...new Set(weeks.flatMap(w => w.dates))].sort();
  // A day counts for the network when every route had good recordings that day.
  const healthyDates = dates.filter(d => weeks.every(w => !w.dates.includes(d) || w.healthyDates.includes(d)));
  const late = weeks.flatMap(w => (w.late && w.late.n > 0 ? [w.late] : []));
  const trip = weeks.flatMap(w => (w.tripTime && w.tripTime.n > 0 ? [w.tripTime] : []));
  const wait = weeks.flatMap(w => (w.extraWait && w.extraWait.gaps > 0 ? [w.extraWait] : []));
  const bunch = weeks.flatMap(w => (w.bunching && w.bunching.gaps > 0 ? [w.bunching] : []));
  const deliv = weeks.flatMap(w => (w.delivered ? [w.delivered] : []));
  const lateN = sum(late.map(x => x.n));
  const tripN = sum(trip.map(x => x.n));
  const gapsW = sum(wait.map(x => x.gaps));
  const gapsB = sum(bunch.map(x => x.gaps));
  const seen = sum(deliv.map(x => x.seen)), notSeen = sum(deliv.map(x => x.notSeen)), unknown = sum(deliv.map(x => x.unknown));
  return {
    days: dates.length,
    dates,
    healthyDates,
    late: lateN > 0 ? { share: sum(late.map(x => x.share * x.n)) / lateN, n: lateN } : null,
    // Minutes averaged over trips: the scheduled and typical trip of the network, and the gap between them.
    tripTime: tripN > 0 ? {
      n: tripN,
      scheduledMin: sum(trip.map(x => x.scheduledMin * x.n)) / tripN,
      typicalMin: sum(trip.map(x => x.typicalMin * x.n)) / tripN,
      overMin: sum(trip.map(x => x.overMin * x.n)) / tripN,
    } : null,
    extraWait: gapsW > 0 ? { minutes: sum(wait.map(x => x.minutes * x.gaps)) / gapsW, gaps: gapsW } : null,
    bunching: gapsB > 0 ? { share: sum(bunch.map(x => x.share * x.gaps)) / gapsB, gaps: gapsB } : null,
    delivered: seen + notSeen > 0 ? { share: seen / (seen + notSeen), seen, notSeen, unknown } : null,
  };
}

/** Running time over the timetable as a share of scheduled time (null without measured trips). */
export function runTimeOver(t: WeekMetrics['tripTime']): number | null {
  return t && t.n > 0 && t.scheduledMin > 0 ? (t.typicalMin - t.scheduledMin) / t.scheduledMin : null;
}

/** The network's late share for each of this week's good days: all routes' late departures over all their departures. */
function networkDaily(inputs: readonly AgencyRouteInput[], healthy: readonly string[]): { late: number[]; delivered: number[] } {
  const late: number[] = [], delivered: number[] = [];
  for (const d of healthy) {
    let n = 0, l = 0, seen = 0, total = 0;
    for (const { v3 } of inputs) {
      const row = v3.bands.all.adherence.timepoints.all.byDate.find(x => x.date === d);
      if (row) { n += row.n; l += row.late; }
      const day = v3.serviceDelivered?.byDay.find(x => x.date === d);
      if (day) { seen += day.seen; total += day.seen + day.notSeen; }
    }
    if (n > 0) late.push(l / n);
    if (total > 0) delivered.push(seen / total);
  }
  return { late, delivered };
}

const dirLabel = (v3: LiveV3, d: number) => v3.directionLabels[String(d)] ?? `Direction ${d}`;

export function agencySummary(input: {
  agency: string;
  totalRoutes: number;
  routes: readonly AgencyRouteInput[];
  held?: ReadonlyArray<{ route: string }>;
  generatedAt?: string;
  top?: { stops?: number; stretches?: number };
}): AgencySummary {
  const { agency, routes } = input;
  const topStops = input.top?.stops ?? 15, topStretches = input.top?.stretches ?? 10;
  const withWeekly = routes.filter(r => r.v3.weekly);
  const weekly = withWeekly.length ? (() => {
    const thisWeek = combineWeeks(withWeekly.map(r => r.v3.weekly!.thisWeek));
    const lastWeek = combineWeeks(withWeekly.map(r => r.v3.weekly!.lastWeek));
    const minHealthyDays = Math.max(...withWeekly.map(r => r.v3.weekly!.minHealthyDays));
    return { thisWeek, lastWeek, minHealthyDays, comparable: thisWeek.healthyDates.length >= minHealthyDays && lastWeek.healthyDates.length >= minHealthyDays };
  })() : null;

  const rows: AgencyRouteRow[] = routes.map(({ route, label, titleLabel, mode, longName, v3 }) => {
    const t = v3.weekly?.thisWeek, l = v3.weekly?.lastWeek;
    const block = v3.bands.all.adherence.timepoints.all;
    return {
      route, label, ...(titleLabel ? { titleLabel } : {}), ...(mode != null ? { mode, longName: longName ?? null } : {}),
      lateShare: t?.late?.share ?? null,
      lateN: t?.late?.n ?? 0,
      lateLastWeek: v3.weekly?.comparable ? l?.late?.share ?? null : null,
      runTimeOver: runTimeOver(t?.tripTime ?? null),
      bunchingShare: t?.bunching?.share ?? null,
      deliveredShare: t?.delivered?.share ?? null,
      lateByHour: block.byHour.filter(h => h.n > 0).map(h => ({ hour: h.hour, value: h.lateShare, n: h.n })),
    };
  }).sort((a, b) => (b.lateShare ?? -1) - (a.lateShare ?? -1) || a.route.localeCompare(b.route, undefined, { numeric: true }));

  const worstStops: AgencyHotspotStop[] = routes.flatMap(({ route, label, v3, uncertainStart }) =>
    rankStops(v3.stops, null, uncertainStart ?? [])
      .filter(s => s.n >= AGENCY_MIN_N)
      .map(s => ({ route, routeLabel: label, stopId: s.stopId, name: s.name, directionId: s.directionId, direction: dirLabel(v3, s.directionId), lateShare: s.lateShare, medianMin: s.medianMin, p90Min: s.p90Min, n: s.n })))
    .sort((a, b) => b.lateShare - a.lateShare || b.n - a.n)
    // At most PER_DIRECTION stops from one route direction, so one late stretch (a diversion) does not fill the list.
    .filter((s, _i, all) => all.filter(x => x.route === s.route && x.directionId === s.directionId).indexOf(s) < STOPS_PER_DIRECTION)
    .slice(0, topStops);

  // Only directions whose route page says "delay jumps here and stays up" (kind 'forms'): a gradual build-up has no
  // single place, and the biggest single step is often the run into a terminal loop.
  const delayStarts: AgencyHotspotStretch[] = routes.flatMap(({ route, label, v3 }) => v3.buildup.flatMap(b => {
    const s = b.kind === 'forms' ? b.forms : null;
    if (!s || s.n < AGENCY_MIN_N || s.medianAddedMin <= 0) return [];
    return [{ route, routeLabel: label, directionId: b.directionId, direction: dirLabel(v3, b.directionId), fromStopId: s.fromStopId, toStopId: s.toStopId, fromName: s.fromName, toName: s.toName, value: s.medianAddedMin, n: s.n }];
  })).sort((a, b) => b.value - a.value).slice(0, topStretches);

  // Same rule for bunching: only where the route page says it forms and stays up.
  const bunchingForms: AgencyHotspotStretch[] = routes.flatMap(({ route, label, v3 }) => v3.bunching.flatMap(d => {
    const band = d.bands.all;
    const s = band?.kind === 'forms' ? band.forms : null;
    if (!s || s.rise <= 0) return [];
    const n = band.stops.find(x => x.stopId === s.toStopId)?.n ?? 0;
    if (n < AGENCY_MIN_N) return [];
    return [{ route, routeLabel: label, directionId: d.directionId, direction: dirLabel(v3, d.directionId), fromStopId: s.fromStopId, toStopId: s.toStopId, fromName: s.fromName, toName: s.toName, value: s.rise, n }];
  })).sort((a, b) => b.value - a.value).slice(0, topStretches);

  return {
    schema: 1,
    agency,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    totalRoutes: input.totalRoutes,
    covered: routes.map(r => r.route),
    held: (input.held ?? []).map(h => ({ route: h.route })),
    weekly,
    daily: weekly ? networkDaily(routes, weekly.thisWeek.healthyDates) : { late: [], delivered: [] },
    routes: rows,
    worstStops,
    delayStarts,
    bunchingForms,
  };
}

