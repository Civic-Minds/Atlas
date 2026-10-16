import { useId, useState } from 'react';
import { SPARKLINE_HOUR_LABELS } from '../../../shared/config';
import { liveChartHours } from '../../utils/sparklinePeriods';
import DataTable from '../ui/DataTable';
import DeparturesLine from './DeparturesLine';

export interface HourValue {
  /** Hour of day, 0-23. */
  hour: number;
  value: number;
  /** Sample size: bars under `minN` fade. */
  n: number;
}

const H = 64;
const clock = (h24: number) => `${h24 % 12 === 0 ? 12 : h24 % 12} ${h24 % 24 < 12 ? 'am' : 'pm'}`;

/**
 * A small bar for each hour of the day, in the route card's sparkline shape (same hour order, narrow rounded bars, 90%
 * opacity, faded where the sample is small, 6a / 12p / 6p / 12a labels). Made for small multiples: pass the same `scale`
 * to every chart in a row so their bars compare. Values below zero hang under a dashed zero line. Hours with no data are
 * left empty, not drawn as zero. The whole chart is one focusable unit with a summary label, and a table view.
 */
export default function HourSpark({ values, scale, color, format, ariaLabel, unit, valueHeader, minN = 30, hours, height = H, hoverLine, departures = false }: {
  values: readonly HourValue[];
  scale: { min: number; max: number };
  /** CSS colour (a token). */
  color: string;
  format: (v: number) => string;
  ariaLabel: string;
  /** What `n` counts, for hover text and the table. */
  unit: string;
  valueHeader: string;
  minN?: number;
  /** The hover line for an hour, replacing the default "2 pm 5%, 167 departures" (the late charts: lateHourLine). */
  hoverLine?: (clock: string, v: HourValue) => string;
  /** Draw the departures in each hour as a thin grey line over the bars (the late charts, CIV-282). */
  departures?: boolean;
  /** Bar area height in px (taller when the chart has a whole row to itself). */
  height?: number;
  /** The hour axis (GTFS hours); charts side by side pass the same one. Default: liveChartHours for these values. */
  hours?: readonly number[];
}) {
  const tableId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const byHour = new Map(values.map(v => [v.hour, v]));
  const span = scale.max - scale.min || 1;
  const pos = (v: number) => Math.max(0, Math.min(height, ((v - scale.min) / span) * height));
  const zeroPx = pos(0);
  const axis = hours ?? liveChartHours(h => (byHour.get(h)?.n ?? 0) >= minN);
  const ordered = axis.map(h => byHour.get(h % 24)).filter((v): v is HourValue => !!v);
  return (
    <figure className="m-0">
      <div role="img" aria-label={ariaLabel} aria-describedby={tableId} tabIndex={0} className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]">
        <div aria-hidden="true" onPointerLeave={() => setHover(null)}>
          {/* The hovered hour's figures, in the sparkline's way: a highlight behind the bar and one line above. */}
          <div className="h-5 truncate text-xs text-[var(--text-secondary)]">
            {hover != null && byHour.get(hover) && (hoverLine ? hoverLine(clock(hover), byHour.get(hover)!) : <><span className="font-bold">{clock(hover)}</span> {format(byHour.get(hover)!.value)}, {byHour.get(hover)!.n.toLocaleString()} {unit}{byHour.get(hover)!.n < minN ? ' (too few to rely on)' : ''}</>)}
          </div>
          <div className="relative flex gap-px" style={{ height }}>
            {departures && <DeparturesLine counts={axis.map(h => byHour.get(h % 24)?.n ?? null)} style={{ zIndex: 1 }} />}
            {scale.min < 0 && <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[var(--text-dim)] opacity-60" style={{ bottom: zeroPx }} />}
            {axis.map(gtfsHour => {
              const v = byHour.get(gtfsHour % 24);
              if (!v) return <div key={gtfsHour} className="min-w-0 flex-1" />;
              const top = pos(Math.max(v.value, 0));
              const bottom = pos(Math.min(v.value, 0));
              return (
                <div key={gtfsHour} className={`relative h-full min-w-0 flex-1 rounded-sm ${hover === v.hour ? 'bg-[var(--bg-btn-hover)]' : ''}`} onPointerEnter={() => setHover(v.hour)} onPointerDown={() => setHover(v.hour)}>
                  <div
                    className={`absolute left-1/2 w-[60%] max-w-[12px] min-w-[3px] -translate-x-1/2 rounded-sm ${v.n >= minN ? 'opacity-90' : 'opacity-35'}`}
                    style={{ bottom, height: Math.max(2, top - bottom), background: color }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex gap-px">
            {axis.map(h => (
              <div key={h} className="min-w-0 flex-1 text-center"><span className="text-xs text-[var(--text-dim)]">{SPARKLINE_HOUR_LABELS[h]}</span></div>
            ))}
          </div>
        </div>
      </div>
      <div id={tableId} className="sr-only">
          <DataTable
            caption={ariaLabel}
            rows={ordered}
            rowKey={v => v.hour}
            columns={[
              { key: 'hour', header: 'Hour', rowHeader: true, className: 'font-normal', cell: v => clock(v.hour) },
              { key: 'value', header: valueHeader, className: 'whitespace-nowrap', cell: v => format(v.value) },
              { key: 'n', header: unit.charAt(0).toUpperCase() + unit.slice(1), cell: v => v.n.toLocaleString() },
            ]}
          />
      </div>
    </figure>
  );
}
