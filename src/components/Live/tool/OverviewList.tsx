import { useMemo } from 'react';
import type { AgencyRouteRow, AgencySummary } from '../../../../shared/liveAgency';
import type { LiveV3 } from '../../../../shared/liveDashboard';
import { routeLabels } from '../../../utils/format';
import { MEASURES, type MapMeasure } from '../routeMapModel';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const signed = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(Math.round(x * 100))}%`;

/** A route's figure for the chosen measure, as a number to sort by and the text to show. Null when it has none. */
function figure(r: AgencyRouteRow, v3: LiveV3 | undefined, measure: MapMeasure): { value: number; text: string } | null {
  switch (measure) {
    case 'late': return r.lateShare == null ? null : { value: r.lateShare, text: pct(r.lateShare) };
    case 'runTime': return r.runTimeOver == null ? null : { value: r.runTimeOver, text: signed(r.runTimeOver) };
    case 'bunching': return r.bunchingShare == null ? null : { value: r.bunchingShare, text: pct(r.bunchingShare) };
    default: { const w = v3?.weekly?.thisWeek.extraWait; return w ? { value: w.minutes, text: `${Math.round(w.minutes * 10) / 10} min` } : null; }
  }
}

/**
 * The agency overview: every route with its figure for the chosen measure, worst first; a click selects the route. The
 * header is the measure's own label. Routes with no figure sit at the end.
 */
export default function OverviewList({ s, measure, route, network, onPick }: { s: AgencySummary; measure: MapMeasure; route: string | null; network: Map<string, LiveV3>; onPick: (route: string) => void }) {
  const rows = useMemo(() => s.routes
    .map(r => ({ r, f: figure(r, network.get(r.route), measure) }))
    .sort((a, b) => (b.f?.value ?? -Infinity) - (a.f?.value ?? -Infinity) || a.r.route.localeCompare(b.r.route, undefined, { numeric: true })), [s, measure, network]);
  return (
    <section aria-label="Routes" className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-[var(--border-primary)] bg-[var(--bg-header)]/90 p-4 shadow-lg backdrop-blur">
      <div className="flex shrink-0 items-baseline justify-between text-xs font-bold text-[var(--text-muted)]">
        <span>Routes</span>
        <span>{MEASURES.find(([k]) => k === measure)![1]}</span>
      </div>
      <ul className="m-0 mt-2 min-h-0 flex-1 overflow-y-auto p-0">
        {rows.map(({ r, f }) => {
          const l = routeLabels({ shortName: r.route, longName: r.longName ?? null, mode: r.mode ?? 3, agencyName: s.agency.toUpperCase() });
          return (
            <li key={r.route} className="list-none">
              <button type="button" onClick={() => onPick(r.route)} aria-current={r.route === route ? 'true' : undefined}
                className={`grid w-full grid-cols-[2.75rem_minmax(0,1fr)_auto] items-baseline gap-x-2 rounded-xl px-2 py-1.5 text-left text-sm ${r.route === route ? 'bg-[var(--accent-selected-bg)]' : 'hover:bg-[var(--bg-hover)]'}`}>
                <span className="font-bold">{l.primary}</span>
                <span className="truncate text-[var(--text-secondary)]">{l.secondary}</span>
                <span className="tabular-nums">{f?.text ?? '–'}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
