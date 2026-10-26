import { useMemo } from 'react';
import { minutesText } from '../../../../shared/liveFormat';
import { runTimeDiffText } from '../../../../shared/liveWording';
import type { AgencyRouteRow, AgencySummary } from '../../../../shared/liveAgency';
import type { DashboardBand, LiveV3 } from '../../../../shared/liveDashboard';
import { routeLabels } from '../../../utils/format';
import { mapStep, measureLabel, type MapMeasure } from '../routeMapModel';
import { delayHeatPoints } from '../delayHeatModel';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const signed = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(Math.round(x * 100))}%`;

/** A route's figure for the chosen measure, as a number to sort by and the text to show. Null when it has none. */
function figure(r: AgencyRouteRow, v3: LiveV3 | undefined, measure: MapMeasure, band: DashboardBand = 'all'): { value: number; text: string } | null {
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

/**
 * The agency overview: every route with its figure for the chosen measure, worst first; a click selects the route. The
 * header is the measure's own label. Routes with no figure sit at the end.
 */
export default function OverviewList({ s, measure, band = 'all', route, network, onPick }: { s: AgencySummary; measure: MapMeasure; band?: DashboardBand; route: string | null; network: Map<string, LiveV3>; onPick: (route: string) => void }) {
  const rows = useMemo(() => rankRoutes(s, network, measure, band), [s, measure, band, network]);
  // Every route is listed: the route list is the only route picker. Nothing scrolls, so a list taller than its room is clipped at the bottom.
  const shown = rows;
  const bars = useMemo(() => routeBars(rows, measure), [rows, measure]);
  return (
    <section aria-label="Routes" className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-[var(--border-primary)] bg-[var(--bg-header)]/90 p-3 shadow-lg backdrop-blur">
      <div className="flex shrink-0 items-baseline justify-between text-xs font-bold text-[var(--text-muted)]">
        <span>Routes</span>
        <span>{measureLabel(measure)}</span>
      </div>
      <ul className="m-0 mt-1 min-h-0 flex-1 overflow-hidden p-0">
        {shown.map(({ r, f }, i) => {
          const l = routeLabels({ shortName: r.route, longName: r.longName ?? null, mode: r.mode ?? 3, agencyName: s.agency.toUpperCase() });
          return (
            <li key={r.route} className="list-none">
              <button type="button" onClick={() => onPick(r.route)} aria-current={r.route === route ? 'true' : undefined}
                className={`grid w-full grid-cols-[2.75rem_minmax(0,1fr)_auto] items-baseline gap-x-2 rounded-xl px-2 py-0.5 text-left text-sm ${r.route === route ? 'bg-[var(--accent-selected-bg)]' : 'hover:bg-[var(--bg-hover)]'}`}>
                <span className="font-bold">{l.primary}</span>
                <span className="truncate text-[var(--text-secondary)]">{l.secondary}</span>
                <span className="tabular-nums">{f?.text ?? '–'}</span>
                {/* Under the name and figure, so the bar takes no room from the name. */}
                <span aria-hidden className="col-span-2 col-start-2 mb-0.5 h-1">{bars[i] && <span className="block h-full rounded-full" style={{ width: `${Math.max(2, bars[i]!.width * 100)}%`, background: bars[i]!.color }} />}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
