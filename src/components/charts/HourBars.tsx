import { useId, useState } from 'react';
import { HOUR_TO_PERIOD, hourAtOn, liveChartHours, periodBandsFor } from '../../utils/sparklinePeriods';
import { PERIOD_LABELS } from '../../hooks/useIntervalStats';
import { SPARKLINE_HOUR_LABELS } from '../../../shared/config';
import DataTable from '../ui/DataTable';
import DeparturesLine from './DeparturesLine';
import LegendItem from '../ui/LegendItem';

export interface HourColumn {
  /** Hour of day, 0-23. */
  hour: number;
  n: number;
  /** Shares of n, bottom to top; they add up to 1. */
  parts: readonly number[];
}

export interface HourPart {
  name: string;
  /** CSS colour (a token). */
  color: string;
}

const H = 96;
const clock = (h24: number) => `${h24 % 12 === 0 ? 12 : h24 % 12} ${h24 < 12 ? 'am' : 'pm'}`;

/**
 * A bar for each hour of the day, in the same shape as the route card's schedule sparkline: same hour order, narrow
 * rounded bars, 90% opacity, a faded bar where there are too few departures, and the same axis labels (6a, 12p, 6p, 12a).
 * Each bar splits into shares (for example ahead / on time / late) with a small gap between them. The numbers are also
 * in a table for screen readers.
 */
/**
 * Always the whole day. Hovering or tapping an hour highlights its time of day (AM peak, midday...) and names it, the
 * same way the route card's schedule sparkline does (shared bands in utils/sparklinePeriods), and the line under the
 * chart reads out that hour. `showKey`: the colour key and low-sample note (turn off for small multiples sharing one key).
 */
export default function HourBars({ columns, parts, ariaLabel, minN = 30, showKey = true, title, hours, hoverLine, departures = false }: { columns: readonly HourColumn[]; parts: readonly HourPart[]; ariaLabel: string; minN?: number; showKey?: boolean; title?: string; /** The hour axis (GTFS hours); charts side by side pass the same one. Default: liveChartHours for these columns. */ hours?: readonly number[]; /** The hover line for an hour, replacing the default share list (the late charts: lateHourLine). */ hoverLine?: (clock: string, c: HourColumn) => string; /** Draw the departures in each hour as a thin grey line over the bars (CIV-282). */ departures?: boolean }) {
  const tableId = useId();
  const [hour, setHour] = useState<number | null>(null);
  const period = hour != null ? HOUR_TO_PERIOD[hour] ?? null : null;
  const byHour = new Map(columns.map(c => [c.hour, c]));
  const axis = hours ?? liveChartHours(h => (byHour.get(h)?.n ?? 0) >= minN);
  const bands = periodBandsFor(axis);
  const pick = (e: React.MouseEvent<HTMLDivElement>) => setHour(hourAtOn(axis, e.clientX, e.currentTarget.getBoundingClientRect()));
  const text = (c: HourColumn) => (hoverLine ? hoverLine(clock(c.hour), c) : `${clock(c.hour)}: ${c.parts.map((p, i) => `${parts[i].name} ${Math.round(p * 100)}%`).join(', ')} (${c.n.toLocaleString()} departures)`);
  const ordered = axis.map(h => byHour.get(h % 24)).filter((c): c is HourColumn => !!c);
  return (
    <figure className="m-0">
      {title && <figcaption className="mb-1 text-sm font-bold">{title}</figcaption>}
      <div role="img" aria-label={ariaLabel} tabIndex={0} aria-describedby={tableId}>
        <div aria-hidden="true">
        <div className="relative cursor-pointer select-none pt-5" onMouseMove={pick} onClick={pick} onMouseLeave={() => setHour(null)}>
        {period && <span className="pointer-events-none absolute right-0 top-0 text-xs font-bold text-[var(--text-dim)]">{PERIOD_LABELS[period as keyof typeof PERIOD_LABELS]}</span>}
        {period && bands[period]?.map((band, i) => (
          <div key={i} className="pointer-events-none absolute bottom-0 top-5 rounded-sm bg-[var(--bg-btn-hover)]" style={{ left: `${band.left * 100}%`, width: `${band.width * 100}%` }} />
        ))}
        <div className="relative z-10 flex items-end gap-px" style={{ height: H }}>
          {departures && <DeparturesLine counts={axis.map(h => byHour.get(h % 24)?.n ?? null)} style={{ zIndex: 1 }} />}
          {axis.map(gtfsHour => {
            const c = byHour.get(gtfsHour % 24);
            const enough = !!c && c.n >= minN;
            const muted = period != null && HOUR_TO_PERIOD[gtfsHour] !== period;
            return (
              <div key={gtfsHour} className="flex h-full min-w-0 flex-1 items-end justify-center" title={c ? text(c) : undefined}>
                {c && (
                  <div className={`flex w-[60%] max-w-[14px] min-w-[3px] flex-col-reverse gap-[2px] overflow-hidden rounded-sm ${muted ? 'opacity-40' : enough ? 'opacity-90' : 'opacity-40'}`} style={{ height: H }}>
                    {c.parts.map((share, i) => share > 0 ? <div key={parts[i].name} style={{ flex: `${share} 1 0`, background: parts[i].color }} /> : null)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </div>
        <div className="mt-1 flex gap-px">
          {axis.map(h => (
            <div key={h} className="min-w-0 flex-1 text-center"><span className="text-xs text-[var(--text-dim)]">{SPARKLINE_HOUR_LABELS[h]}</span></div>
          ))}
        </div>
        </div>
      </div>
      <p className="mt-1 min-h-4 text-xs text-[var(--text-muted)]" aria-live="polite">{hour != null ? (byHour.get(hour % 24) ? text(byHour.get(hour % 24)!) : `${clock(hour % 24)}: no departures`) : 'Hover over an hour to see its time of day.'}</p>
      {showKey && <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-[var(--text-dim)]">
        <span className="font-normal">Paler bars rest on fewer than {minN} departures.</span>
        {parts.map(p => <span key={p.name} className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: p.color }} aria-hidden="true" />{p.name}</span>)}
        {departures && <LegendItem kind="line" color="var(--text-dim)">Departures</LegendItem>}
      </div>}
      {/* The numbers behind the chart, for screen readers only: linked to the chart by aria-describedby. */}
      <div id={tableId} className="sr-only">
        <div>
          <DataTable
            fixed
            caption={ariaLabel}
            rows={ordered}
            rowKey={c => c.hour}
            columns={[
              { key: 'hour', header: 'Hour', rowHeader: true, className: 'font-normal', cell: c => clock(c.hour) },
              ...parts.map((p, i) => ({ key: p.name, header: p.name, cell: (c: HourColumn) => `${Math.round(c.parts[i] * 100)}%` })),
              { key: 'n', header: 'Departures', cell: c => c.n.toLocaleString() },
            ]}
          />
        </div>
      </div>
    </figure>
  );
}
