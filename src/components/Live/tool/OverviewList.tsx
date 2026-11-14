import { useMemo } from 'react';
import type { AgencySummary } from '../../../../shared/liveAgency';
import type { DashboardBand, LiveV3 } from '../../../../shared/liveDashboard';
import { routeLabels } from '../../../utils/format';
import { measureLabel, type MapMeasure } from '../routeMapModel';
import { rankRoutes, routeBars } from '../overviewListModel';

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
          const l = routeLabels({ shortName: r.route, longName: r.longName ?? null, mode: r.mode ?? 3, agencyName: s.agency });
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
