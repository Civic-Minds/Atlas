import { useEffect, useRef, useState } from 'react';
import DataTable from '../ui/DataTable';
import { pickAxisLabels } from '../../utils/stopLabel';

export interface ProfilePoint {
  /** Stop or stretch name: shown in the tooltip and the table. */
  label: string;
  y: number;
  /** A second value stacked on top of `y` (for example gaps that are too far apart on top of those too close). */
  y2?: number;
  /** Optional range drawn as a thin line through the bar (clipped to the chart's scale). */
  lo?: number;
  hi?: number;
  /** A reference value drawn as a short tick across the bar (for example the timetable's running time). */
  ref?: number;
  /** Sample size, shown on hover and in the table. */
  n?: number;
  /** Shorter name for the axis (the full `label` stays in the tooltip and table). */
  short?: string;
  /** A stop worth naming on the axis (a station or terminal). */
  major?: boolean;
  /** Measured less exactly (for example in a tunnel): drawn striped, with a shaded band. */
  lessExact?: boolean;
}

export interface ProfileMark {
  index: number;
  label: string;
}

export interface ProfileSeries {
  name: string;
  /** CSS colour (a token). */
  color: string;
}

const H = 120;

interface ProfileBarsProps {
  points: readonly ProfilePoint[];
  /** One sentence for screen readers: what the chart shows and its main finding. The whole chart is one focusable unit. */
  ariaLabel: string;
  formatY: (y: number) => string;
  /** What `n` counts (trips, gaps): bars with fewer than `minN` fade, and one caption says so. */
  unit: string;
  minN?: number;
  /** One short sentence saying what the bars are; the faded-bar sentence is added after it. */
  caption: string;
  /** One line above the chart saying what it shows, so the chart does not have to be decoded. */
  takeaway?: string;
  /** Small line above the plot naming the axis, for example "Delay at the stop (above the line is late)". */
  axisTitle?: string;
  marks?: readonly ProfileMark[];
  /** Draw the zero line (for delays, where early is below it). */
  zero?: boolean;
  /** Word for the zero tick instead of the number, for example "On time". */
  zeroLabel?: string;
  /** Use this scale instead of the bars' own, so two charts side by side can be compared. */
  scale?: { min: number; max: number };
  /** Draw the thin 1-in-10 line through each bar (default yes). The range is still in the table either way. */
  whiskers?: boolean;
  /** Most names to print under the chart (default 6). */
  maxLabels?: number;
  /** What the striped, less exact bars mean, shown in the key (only when some points are `lessExact`). */
  lessExactNote?: string;
  /** Names for the stacked series, in order (y, then y2). */
  series?: readonly ProfileSeries[];
  /** Header for the value column of the table view. */
  valueHeader: string;
  /** Header for the reference column of the table view (when points carry `ref`). */
  refHeader?: string;
  /** What the "Show as a table" first column holds (default Stop). */
  rowHeader?: string;
}

/** The scale two charts should share: the bars' own range (not the thin lines), always including zero. */
export function sharedScale(groups: ReadonlyArray<readonly ProfilePoint[]>): { min: number; max: number } {
  const all = groups.flat();
  return {
    min: Math.min(0, ...all.map(p => p.y)),
    max: Math.max(0, ...all.map(p => p.y + (p.y2 ?? 0))),
  };
}

/** Round a range out to a few round tick values (1, 2 or 5 times a power of ten). */
export function niceAxis(min: number, max: number, target = 4): { min: number; max: number; ticks: number[] } {
  const range = max - min || 1;
  const raw = range / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 5, 10].map(m => m * mag).find(s => s >= raw)) ?? mag * 10;
  const lo = Math.floor(min / step + 1e-9) * step;
  const hi = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Math.round(t / step) * step);
  return { min: lo, max: hi, ticks: ticks.map(t => Math.round(t * 1e6) / 1e6) };
}

function usePlotWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width || 560);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => setWidth(entries[0].contentRect.width || 560));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * One bar per stop along the route, in the same shape as the route card's schedule sparkline: narrow rounded bars at
 * 90% opacity with a small gap. It has a real value axis with units, a solid zero line when values go below zero, a few
 * stop names that never overlap (the ends, the marked stretch, major stops), and a shaded, striped look for points that
 * are measured less exactly. The values are also available as a table.
 */
export default function ProfileBars({ points, ariaLabel, formatY, unit, minN = 30, caption, takeaway, axisTitle, marks = [], zero = false, zeroLabel, scale, whiskers = true, maxLabels = 6, lessExactNote, series, valueHeader, refHeader, rowHeader = 'Stop' }: ProfileBarsProps) {
  const [plotRef, plotWidth] = usePlotWidth();
  if (points.length < 2) return null;
  const own = scale ?? sharedScale([points]);
  const axis = niceAxis(own.min, own.max);
  const span = axis.max - axis.min || 1;
  const pos = (v: number) => Math.max(0, Math.min(H, ((v - axis.min) / span) * H)); // px from the bottom
  const markAt = new Map(marks.map(m => [m.index, m.label]));
  const text = (p: ProfilePoint) => `${p.label}: ${formatY(p.y + (p.y2 ?? 0))}${p.n != null ? ` (${p.n.toLocaleString()} ${unit})` : ''}${p.lessExact ? ' (less exact)' : ''}`;
  const count = points.length;
  const color0 = series?.[0]?.color ?? 'var(--accent)';
  const color1 = series?.[1]?.color ?? 'var(--accent)';
  const stripe = (c: string) => `repeating-linear-gradient(135deg, ${c} 0 2px, transparent 2px 4px)`;
  // Runs of less exact points, drawn as a shaded band behind the bars.
  const runs: Array<{ from: number; to: number }> = [];
  points.forEach((p, i) => { if (p.lessExact) { const last = runs[runs.length - 1]; if (last && last.to === i - 1) last.to = i; else runs.push({ from: i, to: i }); } });
  const names = points.map(p => p.short ?? p.label);
  // Generous per-character width, capped; each name is also cut to its width with an ellipsis, so names never overlap.
  const labelWidths = names.map(n => Math.min(n.length * 7.2 + 8, 132));
  const labels = pickAxisLabels({
    count, width: plotWidth, max: Math.max(2, Math.min(maxLabels, Math.floor(plotWidth / 90))),
    widths: labelWidths,
    marked: marks.map(m => m.index),
    major: points.flatMap((p, i) => (p.major ? [i] : [])),
  });
  const zeroInside = axis.min < 0;
  return (
    <figure className="m-0">
      {takeaway && <p className="mt-2 text-sm font-bold leading-6">{takeaway}</p>}
      <div role="img" aria-label={ariaLabel} tabIndex={0} className="mt-2">
        {axisTitle && <div className="mb-1 pl-16 text-xs text-[var(--text-dim)]" aria-hidden="true">{axisTitle}</div>}
        <div className={`flex gap-2 ${marks.length ? 'pt-5' : ''}`} aria-hidden="true">
          <div className="relative w-14 shrink-0 text-right text-xs text-[var(--text-dim)]" style={{ height: H }}>
            {axis.ticks.map(t => (
              <span key={t} className="absolute right-0 translate-y-1/2 whitespace-nowrap leading-none" style={{ bottom: pos(t) }}>{t === 0 && zeroLabel ? zeroLabel : formatY(t)}</span>
            ))}
          </div>
          <div ref={plotRef} className="relative min-w-0 flex-1" style={{ height: H }}>
            {axis.ticks.map(t => t !== 0 && <div key={t} className="pointer-events-none absolute inset-x-0 border-t border-[var(--border-primary)] opacity-60" style={{ bottom: pos(t) }} />)}
            {runs.map(r => (
              <div key={r.from} className="pointer-events-none absolute inset-y-0 rounded-sm bg-[var(--control-inactive-bg)]" style={{ left: `${(r.from / count) * 100}%`, width: `${((r.to - r.from + 1) / count) * 100}%` }}>
                <span className="absolute left-1 top-0.5 whitespace-nowrap text-xs text-[var(--text-dim)]">Less exact</span>
              </div>
            ))}
            {(zero || zeroInside) && <div className="pointer-events-none absolute inset-x-0 border-t border-[var(--text-muted)]" style={{ bottom: pos(0) }} />}
            <div className="absolute inset-0 flex gap-px">
              {points.map((p, i) => {
                const marked = markAt.has(i);
                const faded = p.n != null && p.n < minN;
                const top = pos(Math.max(p.y, 0));
                const bottom = pos(Math.min(p.y, 0));
                const h1 = Math.max(p.y2 == null ? 2 : 0, top - bottom);
                const h2 = p.y2 ? pos(p.y2) - pos(0) : 0;
                return (
                  <div key={`${p.label}-${i}`} className="relative h-full min-w-0 flex-1" title={text(p)}>
                    {marked && <div className="pointer-events-none absolute inset-0 rounded-sm bg-[var(--status-caution)] opacity-20" />}
                    <div className={`absolute left-1/2 flex w-[60%] max-w-[14px] min-w-[3px] -translate-x-1/2 flex-col-reverse overflow-hidden rounded-sm ${faded || p.lessExact ? 'opacity-50' : 'opacity-90'}`} style={{ bottom, height: h1 + h2 }}>
                      <div style={{ height: h1, background: p.lessExact ? stripe(color0) : color0 }} />
                      {h2 > 0 ? <div style={{ height: h2, background: p.lessExact ? stripe(color1) : color1 }} /> : null}
                    </div>
                    {p.ref != null && (
                      <div className="pointer-events-none absolute left-1/2 h-[2px] w-[90%] max-w-[22px] -translate-x-1/2 bg-[var(--text-primary)]" style={{ bottom: pos(p.ref) }} />
                    )}
                    {whiskers && p.lo != null && p.hi != null && (
                      <div className="absolute left-1/2 w-px -translate-x-1/2 bg-[var(--text-muted)] opacity-30" style={{ bottom: pos(p.lo), height: Math.max(1, pos(p.hi) - pos(p.lo)) }} />
                    )}
                    {marked && (
                      <span className={`pointer-events-none absolute -top-5 whitespace-nowrap text-xs font-bold text-[var(--status-caution-text)] ${i < count / 4 ? 'left-0' : i > (count * 3) / 4 ? 'right-0' : 'left-1/2 -translate-x-1/2'}`}>{markAt.get(i)}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="relative mt-1 h-5 pl-16" aria-hidden="true">
          <div className="relative h-full overflow-hidden">
            {labels.map(l => (
              <span key={l.index} className="absolute top-0 truncate whitespace-nowrap text-xs text-[var(--text-dim)]" style={{ left: l.left, maxWidth: labelWidths[l.index] }}>{names[l.index]}</span>
            ))}
          </div>
        </div>
      </div>
      <figcaption className="mt-1 text-xs text-[var(--text-dim)]">
        {caption} Faded bars are based on fewer than {minN} {unit}.
        {runs.length > 0 && lessExactNote && <span className="mt-1 flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm" style={{ background: stripe(color0) }} aria-hidden="true" />Striped bars: {lessExactNote}</span>}
        {series && series.length > 1 && (
          <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {series.map(s => <span key={s.name} className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: s.color }} aria-hidden="true" />{s.name}</span>)}
          </span>
        )}
      </figcaption>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer font-bold text-[var(--accent)]">Show as a table</summary>
        <div className="mt-2 max-h-64 overflow-auto">
          <DataTable
            caption={ariaLabel}
            rows={points.map((p, i) => ({ p, i }))}
            rowKey={r => `${r.p.label}-${r.i}`}
            columns={[
              { key: 'stop', header: rowHeader, rowHeader: true, className: 'font-normal', cell: r => r.p.label },
              { key: 'value', header: valueHeader, cell: r => formatY(r.p.y + (r.p.y2 ?? 0)) },
              ...(points.some(p => p.ref != null) ? [{ key: 'ref', header: refHeader ?? 'Reference', cell: (r: { p: ProfilePoint }) => (r.p.ref != null ? formatY(r.p.ref) : '') }] : []),
              ...(points.some(p => p.lo != null) ? [{ key: 'range', header: points.some(p => p.ref != null) ? '1 in 10 over' : 'Most trips between', cell: (r: { p: ProfilePoint }) => (r.p.lo != null && r.p.hi != null ? (r.p.ref != null ? formatY(r.p.hi) : `${formatY(r.p.lo)} and ${formatY(r.p.hi)}`) : '') }] : []),
              { key: 'n', header: unit.charAt(0).toUpperCase() + unit.slice(1), cell: r => (r.p.n != null ? r.p.n.toLocaleString() : '') },
            ]}
          />
        </div>
      </details>
    </figure>
  );
}
