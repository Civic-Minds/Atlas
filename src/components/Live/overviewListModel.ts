/**
 * The Live route list's numbers (CIV-991): each route's figure for the chosen measure, the order the list and the top
 * bar's route menu show, and each row's bar. OverviewList draws them.
 */
import { minutesText, pct, signedPct } from '../../../shared/liveFormat';
import { runTimeDiffText } from '../../../shared/liveWording';
import type { AgencyRouteRow, AgencySummary } from '../../../shared/liveAgency';
import { runTimeDiffMin, weekForBand, withMainPatternTrip, type DashboardBand, type LiveV3 } from '../../../shared/liveDashboard';
import { mapStep, type MapMeasure } from './routeMapModel';
import { delayHeatPoints } from './delayHeatModel';

/**
 * A route's figure for one time of day (#1150, CIV-1459): this week's figure for that period, from the same week
 * comparison the panel's table reads (weekForBand), so the list and the table never disagree. Run time is over each
 * direction's main pattern, as the all-day row. Null when the file has no figures for that period, never the whole day's.
 */
export function bandFigure(v3: LiveV3 | undefined, measure: 'late' | 'runTime' | 'extraWait' | 'bunching', band: DashboardBand): { value: number; text: string } | null {
  const t = v3 ? weekForBand(withMainPatternTrip(v3).weekly, band)?.thisWeek : null;
  if (!t) return null;
  if (measure === 'late') return t.late && t.late.n > 0 ? { value: t.late.share, text: pct(t.late.share) } : null;
  if (measure === 'runTime') {
    if (!t.tripTime || !(t.tripTime.n > 0)) return null;
    const diff = runTimeDiffMin(t.tripTime.typicalMin, t.tripTime.scheduledMin);
    return { value: diff, text: runTimeDiffText(diff, false) };
  }
  if (measure === 'bunching') return t.bunching && t.bunching.gaps > 0 ? { value: t.bunching.share, text: pct(t.bunching.share) } : null;
  return t.extraWait && t.extraWait.gaps > 0 ? { value: t.extraWait.minutes, text: minutesText(t.extraWait.minutes) } : null;
}

/** A route's figure for the chosen measure, as a number to sort by and the text to show. Null when it has none. */
export function figure(r: AgencyRouteRow, v3: LiveV3 | undefined, measure: MapMeasure, band: DashboardBand = 'all'): { value: number; text: string } | null {
  // A time of day reads that period's own figure (#1150, CIV-1459).
  if (band !== 'all' && measure !== 'delayStarts') return bandFigure(v3, measure, band);
  switch (measure) {
    case 'late': return r.lateShare == null ? null : { value: r.lateShare, text: pct(r.lateShare) };
    // Sorted by the minutes it shows (a share would put "4 min faster" above "8 min faster").
    case 'runTime': return r.runTimeOver == null ? null : { value: r.runTimeDiffMin ?? r.runTimeOver, text: r.runTimeDiffMin != null ? runTimeDiffText(r.runTimeDiffMin, false) : signedPct(r.runTimeOver) };
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
