import { useMemo } from 'react';
import { SPARKLINE_HOURS, SPARKLINE_HOUR_LABELS } from '../../../../shared/config';
import type { LiveV3 } from '../../../../shared/liveDashboard';
import type { RouteStripStop } from '../routeStripModel';
import { mapStep, type MapMeasure } from '../routeMapModel';
import Widget from './Widget';

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** The value a stop-hour entry [departures, late, gaps, bunched, too long, extra wait] has for a measure, or null when too little was measured. */
function cellValue(e: NonNullable<NonNullable<LiveV3['stopHours']>[string][string][number]>, measure: MapMeasure): number | null {
  switch (measure) {
    case 'bunching': return e[2] >= 5 && e[3] != null && e[4] != null ? e[3] + e[4] : null;
    case 'extraWait': return e[5];
    default: return e[0] >= 5 ? e[1] : null;
  }
}

/** Every stop of the direction by every hour of the day, coloured by the measure: where and when it goes wrong. A cell picks its stop. Run time has no per-stop hourly figure, so for it nothing is drawn. */
export default function StopHourWidget({ v3, dir, stops, measure, selectedStopId, onPick, onStringLine }: { v3: LiveV3; dir: number; stops: ReadonlyMap<string, RouteStripStop>; measure: MapMeasure; selectedStopId: string | null; onPick: (stopId: string) => void; /** Opens the full-size string-line view. */ onStringLine?: () => void }) {
  const m = measure;
  const rows = useMemo(() => [...stops.values()].map(s => ({ s, row: v3.stopHours?.[String(dir)]?.[s.stopId] })).filter(x => x.row), [v3, dir, stops]);
  if (m === 'runTime' || !rows.length) return null;
  const fam = m === 'bunching' ? 'bunching' : 'delay';
  return (
    <Widget title="Stops by hour" size="large" action={onStringLine ? <button type="button" onClick={onStringLine} className="rounded-full border border-[var(--border-primary)] px-2 py-0.5 text-xs font-bold text-[var(--text-secondary)] hover:border-[var(--accent-border)]">String line</button> : undefined}>
      <div className="flex h-full flex-col">
        <div className="grid min-h-0 flex-1 gap-px" style={{ gridTemplateColumns: `repeat(${SPARKLINE_HOURS.length}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows.length}, minmax(0, 1fr))` }} role="img" aria-label="Stops down the route by hour of the day, coloured by the chosen measure.">
          {rows.map(({ s, row }) => SPARKLINE_HOURS.map(gh => {
            const e = row![gh % 24];
            const v = e ? cellValue(e, m) : null;
            const step = mapStep(m, v);
            const on = s.stopId === selectedStopId;
            return (
              <button key={`${s.stopId}-${gh}`} type="button" tabIndex={-1} onClick={() => onPick(s.stopId)}
                title={`${s.name}, ${SPARKLINE_HOUR_LABELS[gh] ?? gh % 24}${v != null ? `: ${m === 'extraWait' ? `${Math.round(v * 10) / 10} min` : pct(v)}` : ''}`}
                className="block h-full min-h-0 rounded-[1px] p-0"
                style={{ background: step == null ? 'var(--border-primary)' : `var(--strip-${fam}-${step})`, opacity: step == null ? 0.35 : 1, outline: on ? '1px solid var(--text-primary)' : undefined }} />
            );
          }))}
        </div>
        <div className="mt-1 grid shrink-0 text-xs text-[var(--text-dim)]" style={{ gridTemplateColumns: `repeat(${SPARKLINE_HOURS.length}, minmax(0, 1fr))` }}>
          {SPARKLINE_HOURS.map(gh => <span key={gh} className="text-center">{SPARKLINE_HOUR_LABELS[gh] ?? ''}</span>)}
        </div>
      </div>
    </Widget>
  );
}
