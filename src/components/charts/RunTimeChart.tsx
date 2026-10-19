import { useEffect, useId, useRef, useState } from 'react';
import { SPARKLINE_HOUR_LABELS } from '../../../shared/config';
import { liveChartHours } from '../../utils/sparklinePeriods';
import DataTable from '../ui/DataTable';

export interface RunTimeHour {
  /** Hour of day the trips start, 0-23. */
  hour: number;
  n: number;
  scheduledMin: number;
  typicalMin: number;
  p90Min: number;
}

const PAD_TOP_FULL = 22;
const PAD_BOTTOM_FULL = 22;
const AXIS_W_FULL = 40;
const LABEL_W_FULL = 118;
const clock = (h24: number) => `${h24 % 12 === 0 ? 12 : h24 % 12} ${h24 % 24 < 12 ? 'am' : 'pm'}`;

/** The minute range every chart in a row should share, with a little headroom, on whole 5-minute steps. */
export function runTimeScale(groups: ReadonlyArray<readonly RunTimeHour[]>): { min: number; max: number } {
  const all = groups.flat();
  if (!all.length) return { min: 0, max: 10 };
  const lo = Math.min(...all.map(h => Math.min(h.scheduledMin, h.typicalMin)));
  const hi = Math.max(...all.map(h => Math.max(h.scheduledMin, h.p90Min)));
  return { min: Math.max(0, Math.floor((lo - 2) / 5) * 5), max: Math.ceil((hi + 2) / 5) * 5 };
}

export function useWidth() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setWidth(el.getBoundingClientRect().width || el.clientWidth || 0);
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

interface EndLabel { key: string; y: number; h: number; lines: string[]; color: string; weight: number }

/** Place labels near their line's end (`y` is the line's height there), top to bottom, at least their own height apart. */
function spread(labels: EndLabel[], min: number, max: number): Array<EndLabel & { top: number }> {
  const sorted = [...labels].sort((a, b) => a.y - b.y).map(l => ({ ...l, top: l.y - l.h / 2 }));
  for (let k = 1; k < sorted.length; k++) sorted[k].top = Math.max(sorted[k].top, sorted[k - 1].top + sorted[k - 1].h + 2);
  const overflow = sorted.length ? sorted[sorted.length - 1].top + sorted[sorted.length - 1].h - max : 0;
  if (overflow > 0) for (const l of sorted) l.top -= overflow;
  for (let k = 0; k < sorted.length; k++) sorted[k].top = Math.max(sorted[k].top, k ? sorted[k - 1].top + sorted[k - 1].h + 2 : min);
  return sorted;
}

/**
 * Run time against the schedule for one direction, by the hour trips start: the schedule as a dashed line, the usual
 * (median) run time as a solid line with dots, and a light band up to the time 1 in 10 trips take longer than. Each
 * line is labelled where it ends; hours with few trips are faded. The whole chart is one focusable unit with a summary
 * label, each hour shows its figures on hover, and the same figures are available as a table.
 */
export default function RunTimeChart({ hours, scale, ariaLabel, minN = 5, height: H = 240, axis: axisProp, shade, caption = true, compact = false }: {
  hours: readonly RunTimeHour[];
  scale: { min: number; max: number };
  ariaLabel: string;
  minN?: number;
  /** Chart height in px. */
  height?: number;
  /** The hour axis (GTFS hours); charts side by side pass the same one. Default: liveChartHours for these hours. */
  axis?: readonly number[];
  /** Hours (0-23) to shade behind the lines: a chosen time of day drawn over the whole day. */
  shade?: (hour: number) => boolean;
  /** The line under the chart saying what the hours are and what faded dots mean (default yes). */
  caption?: boolean;
  /** A sparkline: the lines, band and dots over the hours, with no minute scale or end labels (hover still reads the figures). */
  compact?: boolean;
}) {
  const PAD_TOP = compact ? 6 : PAD_TOP_FULL, PAD_BOTTOM = compact ? 18 : PAD_BOTTOM_FULL, AXIS_W = compact ? 4 : AXIS_W_FULL, LABEL_W = compact ? 4 : LABEL_W_FULL;
  const tableId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const [ref, width] = useWidth();
  const axis = axisProp ?? liveChartHours(h => hours.some(x => x.hour === h && x.n >= minN));
  const slot = (h: number) => axis.findIndex(x => x % 24 === h);
  const pts = hours.map(h => ({ ...h, i: slot(h.hour) })).filter(h => h.i >= 0).sort((a, b) => a.i - b.i);
  const plotW = Math.max(0, width - AXIS_W - LABEL_W);
  const x = (i: number) => AXIS_W + (axis.length > 1 ? (i / (axis.length - 1)) * plotW : 0);
  const span = scale.max - scale.min || 1;
  const y = (m: number) => PAD_TOP + (1 - (m - scale.min) / span) * (H - PAD_TOP - PAD_BOTTOM);
  const step = span > 30 ? 10 : 5;
  const ticks: number[] = [];
  for (let t = Math.ceil(scale.min / step) * step; t <= scale.max; t += step) ticks.push(t);
  // Runs of consecutive well-measured hours: lines and the band break where an hour has no or few trips (those show as faded dots only).
  const runs: (typeof pts)[] = [];
  for (const p of pts.filter(q => q.n >= minN)) { const r = runs[runs.length - 1]; if (r && p.i === r[r.length - 1].i + 1) r.push(p); else runs.push([p]); }
  const path = (r: typeof pts, f: (p: (typeof pts)[number]) => number) => r.map((p, k) => `${k ? 'L' : 'M'}${x(p.i)},${y(f(p))}`).join('');
  // Lines are labelled where they end, at the last hour with enough trips; labels are spread so they never overlap.
  const drawn = runs.filter(r => r.length > 1);
  const lastRun = drawn[drawn.length - 1];
  const last = lastRun ? lastRun[lastRun.length - 1] : pts[pts.length - 1];
  const ends = last ? spread([
    { key: 'band', y: y(last.p90Min), h: 30, lines: ['1 in 10 trips take', 'longer than this'], color: 'var(--text-muted)', weight: 400 },
    { key: 'usual', y: y(last.typicalMin), h: 15, lines: ['Usually'], color: 'var(--text-primary)', weight: 700 },
    { key: 'sched', y: y(last.scheduledMin), h: 15, lines: ['Scheduled'], color: 'var(--text-secondary)', weight: 400 },
  ], PAD_TOP - 8, H - PAD_BOTTOM) : [];
  const colW = plotW / Math.max(1, axis.length - 1);
  return (
    <figure className="m-0">
      <div ref={ref} role="img" aria-label={ariaLabel} aria-describedby={tableId} tabIndex={0} className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]">
        <div className="h-5 truncate text-xs text-[var(--text-secondary)]" aria-hidden="true">
          {hover != null && (() => { const p = pts.find(q => q.i === hover); return p ? <><span className="font-bold">{clock(p.hour)}</span> scheduled {Math.round(p.scheduledMin)} min, usually {Math.round(p.typicalMin)}, 1 in 10 over {Math.round(p.p90Min)} ({p.n.toLocaleString()} trips{p.n < minN ? ', too few to rely on' : ''})</> : null; })()}
        </div>
        {width > 0 && pts.length > 0 && (
          <svg onPointerLeave={() => setHover(null)} width={width} height={H} aria-hidden="true" className="block overflow-visible">
            {shade && axis.map((h, i) => (shade(h % 24) ? <rect key={`shade${h}`} x={x(i) - colW / 2} y={PAD_TOP - 6} width={colW} height={H - PAD_TOP - PAD_BOTTOM + 6} rx={3} fill="var(--bg-btn-hover)" /> : null))}
            {hover != null && <rect x={x(hover) - colW / 2} y={PAD_TOP - 6} width={colW} height={H - PAD_TOP - PAD_BOTTOM + 6} rx={3} fill="var(--bg-btn-hover)" />}
            {!compact && ticks.map(t => (
              <g key={t}>
                <line x1={AXIS_W} x2={AXIS_W + plotW} y1={y(t)} y2={y(t)} stroke="var(--border-primary)" strokeWidth={1} />
                <text x={AXIS_W - 6} y={y(t) + 4} textAnchor="end" fontSize={13} fill="var(--text-dim)">{t}</text>
              </g>
            ))}
            {!compact && <text x={0} y={10} fontSize={13} fill="var(--text-dim)">min</text>}
            {runs.map((r, k) => r.length > 1 && (
              <path key={`band${k}`} d={`${path(r, p => p.p90Min)}${[...r].reverse().map(p => `L${x(p.i)},${y(p.typicalMin)}`).join('')}Z`} fill="var(--strip-delay-1)" opacity={0.18} />
            ))}
            {runs.map((r, k) => r.length > 1 && <path key={`s${k}`} d={path(r, p => p.scheduledMin)} fill="none" stroke="var(--text-secondary)" strokeWidth={1.5} strokeDasharray="4 3" />)}
            {runs.map((r, k) => r.length > 1 && <path key={`u${k}`} d={path(r, p => p.typicalMin)} fill="none" stroke="var(--text-primary)" strokeWidth={2} strokeLinejoin="round" />)}
            {pts.map(p => <circle key={p.i} cx={x(p.i)} cy={y(p.typicalMin)} r={3.5} fill="var(--text-primary)" stroke="var(--bg-primary)" strokeWidth={1.5} opacity={p.n >= minN ? 1 : 0.35} />)}
            {!compact && last && ends.map(l => (
              <line key={`lead${l.key}`} x1={x(last.i) + 6} y1={l.y} x2={AXIS_W + plotW + 6} y2={l.top + 7} stroke="var(--text-dim)" strokeWidth={1} opacity={0.5} />
            ))}
            {!compact && ends.map(l => l.lines.map((t, k) => (
              <text key={`${l.key}${k}`} x={AXIS_W + plotW + 10} y={l.top + 11 + k * 14} fontSize={13} fontWeight={l.weight} fill={l.color}>{t}</text>
            )))}
            {axis.map((h, i) => SPARKLINE_HOUR_LABELS[h] && (
              <text key={h} x={x(i)} y={H - 4} textAnchor="middle" fontSize={13} fill="var(--text-dim)">{SPARKLINE_HOUR_LABELS[h]}</text>
            ))}
            {pts.map(p => (
              <rect key={`hit${p.i}`} x={x(p.i) - colW / 2} y={PAD_TOP} width={colW} height={H - PAD_TOP - PAD_BOTTOM} fill="transparent" onPointerEnter={() => setHover(p.i)} onPointerDown={() => setHover(p.i)} />
            ))}
          </svg>
        )}
        {width === 0 && <div style={{ height: H }} />}
      </div>
      {caption && <figcaption className="mt-1 text-xs text-[var(--text-dim)]">By the hour the trip starts. Faded dots are hours with fewer than {minN} trips.</figcaption>}
      <div id={tableId} className="sr-only">
          <DataTable
            caption={ariaLabel}
            rows={pts}
            rowKey={p => p.hour}
            columns={[
              { key: 'hour', header: 'Starts at', rowHeader: true, className: 'font-normal', cell: p => clock(p.hour) },
              { key: 'sched', header: 'Scheduled', cell: p => `${Math.round(p.scheduledMin)} min` },
              { key: 'usual', header: 'Usually', cell: p => `${Math.round(p.typicalMin)} min` },
              { key: 'p90', header: '1 in 10 over', cell: p => `${Math.round(p.p90Min)} min` },
              { key: 'n', header: 'Trips', cell: p => p.n.toLocaleString() },
            ]}
          />
      </div>
    </figure>
  );
}
