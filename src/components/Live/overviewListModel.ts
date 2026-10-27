/**
 * The Live route list's numbers (CIV-991): each route's figure for the chosen measure, the order the list and the top
 * bar's route menu show, and each row's bar. OverviewList draws them.
 */
import { minutesText } from '../../../shared/liveFormat';
import { runTimeDiffText } from '../../../shared/liveWording';
import type { AgencyRouteRow, AgencySummary } from '../../../shared/liveAgency';
import type { DashboardBand, LiveV3 } from '../../../shared/liveDashboard';
import { mapStep, type MapMeasure } from './routeMapModel';
import { delayHeatPoints } from './delayHeatModel';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const signed = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(Math.round(x * 100))}%`;

/**
 * A route's figure for one time of day (#1150), on the same basis as its all-day figure: late departures at the
 * timepoints, run time over each direction's main pattern, extra wait over every gap. Null when the file has none.
 * Bunching has no time-of-day figure on that basis, so it stays all day.
 */
export function bandFigure(v3: LiveV3 | undefined, measure: 'late' | 'runTime' | 'extraWait', band: DashboardBand): { value: number; text: string } | null {
  if (!v3) return null;
  if (measure === 'late') {
    const o = v3.bands[band]?.adherence.timepoints.all.overall;
    return o && o.n > 0 ? { value: o.lateShare, text: pct(o.lateShare) } : null;
  }
  if (measure === 'runTime') {
    const mains = Object.values(v3.runningTime?.patterns ?? {}).flatMap(list => list.filter(p => p.kind === 'main'))
      .map(p => p.bands?.[band]).filter((f): f is NonNullable<typeof f> => !!f && f.n > 0);
    const n = mains.reduce((a, f) => a + f.n, 0);
    if (!n) return null;
    const typical = mains.reduce((a, f) => a + f.typicalMin * f.n, 0) / n, scheduled = mains.reduce((a, f) => a + f.scheduledMin * f.n, 0) / n;
    const diff = Math.round(typical) - Math.round(scheduled);
    return { value: diff, text: runTimeDiffText(diff, false) };
  }
  const stops = v3.extraWait?.[band] ?? [];
  const gaps = stops.reduce((a, x) => a + x.gaps, 0);
  if (!gaps) return null;
  const minutes = stops.reduce((a, x) => a + x.extraWaitMin * x.gaps, 0) / gaps;
  return { value: minutes, text: minutesText(minutes) };
}

/** A route's figure for the chosen measure, as a number to sort by and the text to show. Null when it has none. */
export function figure(r: AgencyRouteRow, v3: LiveV3 | undefined, measure: MapMeasure, band: DashboardBand = 'all'): { value: number; text: string } | null {
  // A time of day other than all day reads that period's own figure (#1150).
  if (band !== 'all' && (measure === 'late' || measure === 'runTime' || measure === 'extraWait')) return bandFigure(v3, measure, band);
  switch (measure) {
    case 'late': return r.lateShare == null ? null : { value: r.lateShare, text: pct(r.lateShare) };
    // Sorted by the minutes it shows (a share would put "4 min faster" above "8 min faster").
    case 'runTime': return r.runTimeOver == null ? null : { value: r.runTimeDiffMin ?? r.runTimeOver, text: r.runTimeDiffMin != null ? runTimeDiffText(r.runTimeDiffMin, false) : signed(r.runTimeOver) };
    case 'delayStarts': {
      // The route's stop where vehicles add the most, for the map's time of day (the heatmap prototype).
      const top = v3 ? Math.max(0, ...delayHeatPoints(new Map([[r.route, v3]]), band).map(p => p.addedMin)) : null;
      return top == null ? null : { value: top, text: minutesText(top) };
    }
    case 'bunching': return r.bunchingShare == null ? null : { value: r.bunchingShare, text: pct(r.bunchingShare) };
    default: { const w = v3?.weekly?.thisWeek.extraWait; return w ? { value: w.minutes, text: minutesText(w.minutes) } : null; }
  }
}

/**
 * Each row's bar (CIV-946, "most late routes"): its length against the worst route in the list, its colour the map's
 * step for that figure (run time: one neutral colour), so the list reads as a ranked bar chart. Only the bad side has a bar: a run time faster than the
 * timetable has none. Widths are shares of the bar's column (0–1).
 */
export function routeBars(rows: { f: { value: number } | null }[], measure: MapMeasure): ({ width: number; color: string } | null)[] {
  const top = Math.max(0, ...rows.map(({ f }) => f?.value ?? 0));
  return rows.map(({ f }) => {
    if (!f || !(f.value > 0) || !(top > 0)) return null;
    // Run time's key steps are minutes per stretch; the list's figure is minutes over the whole route: one neutral colour.
    if (measure === 'runTime') return { width: f.value / top, color: 'var(--text-secondary)' };
    const step = mapStep(measure, f.value) ?? 0;
    return { width: f.value / top, color: `var(--strip-${measure === 'bunching' ? 'bunching' : 'delay'}-${step})` };
  });
}

/** The routes in the overview's order: worst figure for the measure first, routes with none at the end (the list and the top bar's route menu). */
export function rankRoutes(s: AgencySummary, network: Map<string, LiveV3>, measure: MapMeasure, band: DashboardBand = 'all') {
  return s.routes
    .map(r => ({ r, f: figure(r, network.get(r.route), measure, band) }))
    .sort((a, b) => (b.f?.value ?? -Infinity) - (a.f?.value ?? -Infinity) || a.r.route.localeCompare(b.r.route, undefined, { numeric: true }));
}
