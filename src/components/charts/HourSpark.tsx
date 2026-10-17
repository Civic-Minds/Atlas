import { useId, useState } from 'react';
import { SPARKLINE_HOUR_LABELS } from '../../../shared/config';
import { HOUR_TO_PERIOD, hoverOfHour, liveChartHours, type HourHover } from '../../utils/sparklinePeriods';
import PeriodBand from './PeriodBand';
import DataTable from '../ui/DataTable';

export interface HourValue {
  /** Hour of day, 0-23. */
  hour: number;
  value: number;
  /** Sample size: bars under `minN` fade. */
  n: number;
}

const H = 64;
/** Width of the % axis on the left. */
export const AXIS_W = 36;
/** Height of the departures band under the bars. */
const BAND_H = 12;
const clock = (h24: number) => `${h24 % 12 === 0 ? 12 : h24 % 12} ${h24 % 24 < 12 ? 'am' : 'pm'}`;

/**
 * A small bar for each hour of the day, in the route card's sparkline shape (same hour order, narrow rounded bars, 90%
 * opacity, faded where the sample is small, 6a / 12p / 6p / 12a labels). Made for small multiples: pass the same `scale`
 * to every chart in a row so their bars compare. Values below zero hang under a dashed zero line. Hours with no data are
 * left empty, not drawn as zero. The whole chart is one focusable unit with a summary label, and a table view.
 */
export default function HourSpark({ values, scale, color, barColor, format, ariaLabel, unit, valueHeader, minN = 30, hours, height = H, hoverLine, departures = false, yAxis = false, periodBand = false, idleText, shade, hover: sharedHover, onHover, peakLabel = false }: {
  values: readonly HourValue[];
  scale: { min: number; max: number };
  /** CSS colour (a token). */
  color: string;
  /** A colour per bar from its value (the late charts: the strip's three steps), instead of `color`. */
  barColor?: (value: number) => string;
  /** Draw a few ticks of the scale (0, middle, top) with faint lines behind the bars. */
  yAxis?: boolean;
  /** Draw the band under the hour axis that names each time of day. */
  periodBand?: boolean;
  /** Shown in the hover line while nothing is hovered (a row of charts shows it once). */
  idleText?: string;
  /** What the pointer is on, shared by a row of charts so each highlights the same hour or period. Without it the chart keeps its own. */
  hover?: HourHover | null;
  onHover?: (h: HourHover | null) => void;
  format: (v: number) => string;
  ariaLabel: string;
  /** What `n` counts, for hover text and the table. */
  unit: string;
  valueHeader: string;
  minN?: number;
  /** The hover line for an hour, replacing the default "2 pm 5%, 167 departures" (the late charts: lateHourLine). */
  hoverLine?: (clock: string, v: HourValue) => string;
  /** Draw the departures in each hour as a thin band under the bars, on its own scale (the late charts, CIV-282). */
  departures?: boolean;
  /** Hours (0-23) to shade behind the bars, for a chosen time of day drawn over the whole day. */
  shade?: (hour: number) => boolean;
  /** Bar area height in px (taller when the chart has a whole row to itself). */
  height?: number;
  /** Write the value of the tallest bar (with enough samples) above it: the one number a tiny chart gives. */
  peakLabel?: boolean;
  /** The hour axis (GTFS hours); charts side by side pass the same one. Default: liveChartHours for these values. */
  hours?: readonly number[];
}) {
  const tableId = useId();
  const [own, setOwn] = useState<HourHover | null>(null);
  const hv = onHover ? sharedHover ?? null : own;
  const setHv = onHover ?? setOwn;
  const hover = hv?.hour ?? null;
  const period = hv?.hour == null ? hv?.period ?? null : null;
  const byHour = new Map(values.map(v => [v.hour, v]));
  const span = scale.max - scale.min || 1;
  const pos = (v: number) => Math.max(0, Math.min(height, ((v - scale.min) / span) * height));
  const zeroPx = pos(0);
  const axis = hours ?? liveChartHours(h => (byHour.get(h)?.n ?? 0) >= minN);
  const ticks = !yAxis ? [] : height >= 48 ? [scale.min, (scale.min + scale.max) / 2, scale.max] : [scale.min, scale.max];
  const maxN = Math.max(0, ...axis.map(h => byHour.get(h % 24)?.n ?? 0));
  const ml = yAxis ? AXIS_W : 0;
  const peakHour = peakLabel ? axis.map(h => h % 24).filter(h => (byHour.get(h)?.n ?? 0) >= minN).reduce<number | null>((best, h) => (best == null || byHour.get(h)!.value > byHour.get(best)!.value ? h : best), null) : null;
  const ordered = axis.map(h => byHour.get(h % 24)).filter((v): v is HourValue => !!v);
  return (
    <figure className="m-0">
      <div role="img" aria-label={ariaLabel} aria-describedby={tableId} tabIndex={0} className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]">
        <div aria-hidden="true" onPointerLeave={() => setHv(null)}>
          {/* The hovered hour's figures, in the sparkline's way: a highlight behind the bar and one line above. */}
          <div className="h-5 truncate text-xs text-[var(--text-secondary)]">
            {hover != null && byHour.get(hover) ? (hoverLine ? hoverLine(clock(hover), byHour.get(hover)!) : <><span className="font-bold">{clock(hover)}</span> {format(byHour.get(hover)!.value)}, {byHour.get(hover)!.n.toLocaleString()} {unit}{byHour.get(hover)!.n < minN ? ' (too few to rely on)' : ''}</>) : hv == null ? idleText : null}
          </div>
          <div className={`relative ${yAxis ? 'mt-2.5' : ''}`} style={{ paddingLeft: ml }}>
            {ticks.map(t => (
              <div key={t} data-tick className="pointer-events-none absolute" style={{ top: height - pos(t), left: 0, right: 0 }}>
                <span className="absolute -translate-y-1/2 text-xs leading-none text-[var(--text-dim)]" style={{ left: 0, width: AXIS_W - 6, textAlign: 'right' }}>{format(t)}</span>
                <div className="absolute border-t border-[var(--border-primary)]" style={{ left: AXIS_W, right: 0, opacity: 0.7 }} />
              </div>
            ))}
            <div className="relative flex gap-px" style={{ height }}>
              {scale.min < 0 && <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[var(--text-dim)] opacity-60" style={{ bottom: zeroPx }} />}
              {axis.map(gtfsHour => {
                const v = byHour.get(gtfsHour % 24);
                const lit = (hover != null && hover === gtfsHour % 24) || (period != null && HOUR_TO_PERIOD[gtfsHour] === period) || shade?.(gtfsHour % 24);
                if (!v) return <div key={gtfsHour} data-hour={gtfsHour % 24} data-lit={lit ? '' : undefined} className={`min-w-0 flex-1 rounded-sm ${lit ? 'bg-[var(--bg-btn-hover)]' : ''}`} onPointerEnter={() => setHv(hoverOfHour(gtfsHour % 24))} />;
                const top = pos(Math.max(v.value, 0));
                const bottom = pos(Math.min(v.value, 0));
                return (
                  <div key={gtfsHour} data-hour={v.hour} data-lit={lit ? '' : undefined} className={`relative h-full min-w-0 flex-1 rounded-sm ${lit ? 'bg-[var(--bg-btn-hover)]' : ''}`} onPointerEnter={() => setHv(hoverOfHour(v.hour))} onPointerDown={() => setHv(hoverOfHour(v.hour))}>
                    <div
                      className={`absolute left-1/2 w-[60%] max-w-[12px] min-w-[3px] -translate-x-1/2 rounded-sm ${v.n >= minN ? 'opacity-90' : 'opacity-35'}`}
                      style={{ bottom, height: Math.max(2, top - bottom), background: barColor ? barColor(v.value) : color }}
                    />
                    {peakHour === v.hour && v.value > 0 && hover == null && (
                      <span data-peak className={`pointer-events-none absolute whitespace-nowrap text-xs font-bold leading-3 text-[var(--text-secondary)] ${axis.indexOf(gtfsHour) < 2 ? 'left-0' : axis.indexOf(gtfsHour) > axis.length - 3 ? 'right-0' : 'left-1/2 -translate-x-1/2'}`} style={{ bottom: top + 2 }}>{format(v.value)}</span>
                    )}
                  </div>
                );
              })}
            </div>
            {departures && maxN > 0 && (
              <div data-departures className="mt-1.5 flex gap-px" style={{ height: BAND_H }}>
                {axis.map(h => {
                  const v = byHour.get(h % 24);
                  const n = v?.n ?? 0;
                  return (
                    <div key={h} className="relative min-w-0 flex-1" onPointerEnter={() => setHv(hoverOfHour(h % 24))} onPointerDown={() => setHv(hoverOfHour(h % 24))}>
                      {n > 0 && <div className={`absolute bottom-0 left-1/2 w-[60%] max-w-[12px] min-w-[3px] -translate-x-1/2 rounded-sm bg-[var(--text-dim)] ${n >= minN ? 'opacity-50' : 'opacity-25'}`} style={{ height: Math.max(1, (n / maxN) * BAND_H) }} />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="mt-1 flex gap-px" style={{ marginLeft: ml }}>
            {axis.map((h, i) => {
              // The first and last labels hang from the chart's edge, so a label wider than its hour never runs past the card.
              const edge = i === axis.length - 1 && i > 0 ? 'right-0' : i === 0 && axis.length > 1 ? 'left-0' : 'left-1/2 -translate-x-1/2';
              return (
                <div key={h} className="relative h-4 min-w-0 flex-1"><span className={`absolute top-0 whitespace-nowrap text-xs leading-4 text-[var(--text-dim)] ${SPARKLINE_HOUR_LABELS[h] ? edge : ''}`}>{SPARKLINE_HOUR_LABELS[h]}</span></div>
              );
            })}
          </div>
          {periodBand && <PeriodBand axis={axis} period={hv?.period ?? null} onHover={setHv} style={{ marginLeft: ml }} />}
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
