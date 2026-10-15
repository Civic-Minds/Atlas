import DataTable from '../ui/DataTable';

export interface ProfilePoint {
  /** Stop or stretch name: shown in the tooltip and the table. */
  label: string;
  y: number;
  /** A second value stacked on top of `y` (for example gaps that are too far apart on top of those too close). */
  y2?: number;
  /** Optional range drawn as a thin line through the bar (clipped to the chart's scale). */
  lo?: number;
  hi?: number;
  /** Sample size, shown on hover and in the table. */
  n?: number;
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

const H = 96;

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
  marks?: readonly ProfileMark[];
  /** Draw a dashed zero line (for delays, where early is below it). */
  zero?: boolean;
  /** Use this scale instead of the bars' own, so two charts side by side can be compared. */
  scale?: { min: number; max: number };
  startLabel?: string;
  endLabel?: string;
  /** Names for the stacked series, in order (y, then y2). */
  series?: readonly ProfileSeries[];
  /** Header for the value column of the table view. */
  valueHeader: string;
}

/** The scale two charts should share: the bars' own range (not the thin lines), always including zero. */
export function sharedScale(groups: ReadonlyArray<readonly ProfilePoint[]>): { min: number; max: number } {
  const all = groups.flat();
  return {
    min: Math.min(0, ...all.map(p => p.y)),
    max: Math.max(0, ...all.map(p => p.y + (p.y2 ?? 0))),
  };
}

/**
 * One bar per stop along the route, in the same shape as the route card's schedule sparkline: narrow rounded bars at
 * 90% opacity with a small gap. Values below zero hang under a dashed zero line. A marked stretch gets a tinted band
 * behind its bar, so it shows even when the bar is zero high. The values are also available as a table.
 */
export default function ProfileBars({ points, ariaLabel, formatY, unit, minN = 30, caption, marks = [], zero = false, scale, startLabel, endLabel, series, valueHeader }: ProfileBarsProps) {
  if (points.length < 2) return null;
  const sc = scale ?? sharedScale([points]);
  const span = sc.max - sc.min || 1;
  const pos = (v: number) => Math.max(0, Math.min(H, ((v - sc.min) / span) * H)); // px from the bottom
  const zeroPx = pos(0);
  const markAt = new Map(marks.map(m => [m.index, m.label]));
  const text = (p: ProfilePoint) => `${p.label}: ${formatY(p.y + (p.y2 ?? 0))}${p.n != null ? ` (${p.n.toLocaleString()} ${unit})` : ''}`;
  return (
    <figure className="m-0">
      <div role="img" aria-label={ariaLabel} tabIndex={0}>
      <div className="flex gap-2" aria-hidden="true">
        <div className="flex w-14 shrink-0 flex-col justify-between text-right text-xs text-[var(--text-dim)]" style={{ height: H }}>
          <span>{formatY(sc.max)}</span>
          {sc.min < 0 && <span>{formatY(sc.min)}</span>}
        </div>
        <div className="relative flex min-w-0 flex-1 gap-px" style={{ height: H }}>
          {zero && sc.min < 0 && <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[var(--text-dim)] opacity-60" style={{ bottom: zeroPx }} />}
          {points.map((p, i) => {
            const marked = markAt.has(i);
            const faded = p.n != null && p.n < minN;
            const top = pos(Math.max(p.y, 0));
            const bottom = pos(Math.min(p.y, 0));
            const h1 = Math.max(p.y2 == null ? 2 : 0, top - bottom);
            return (
              <div key={`${p.label}-${i}`} className="relative h-full min-w-0 flex-1" title={text(p)}>
                {marked && <div className="pointer-events-none absolute inset-0 rounded-sm bg-[var(--status-caution)] opacity-20" />}
                <div className={`absolute left-1/2 flex w-[60%] max-w-[14px] min-w-[3px] -translate-x-1/2 flex-col-reverse overflow-hidden rounded-sm ${faded ? 'opacity-40' : 'opacity-90'}`} style={{ bottom, height: h1 + (p.y2 ? pos(p.y2) - pos(0) : 0) }}>
                  <div style={{ height: h1, background: series?.[0]?.color ?? 'var(--accent)' }} />
                  {p.y2 ? <div style={{ height: pos(p.y2) - pos(0), background: series?.[1]?.color ?? 'var(--accent)' }} /> : null}
                </div>
                {p.lo != null && p.hi != null && (
                  <div className="absolute left-1/2 w-px -translate-x-1/2 bg-[var(--text-muted)] opacity-70" style={{ bottom: pos(p.lo), height: Math.max(1, pos(p.hi) - pos(p.lo)) }} />
                )}
                {marked && (
                  <span className={`pointer-events-none absolute -top-5 whitespace-nowrap text-xs font-bold text-[var(--status-caution-text)] ${i < points.length / 4 ? 'left-0' : i > (points.length * 3) / 4 ? 'right-0' : 'left-1/2 -translate-x-1/2'}`}>{markAt.get(i)}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-1 flex justify-between gap-4 pl-16 text-xs text-[var(--text-dim)]" aria-hidden="true">
        <span className="min-w-0 max-w-[45%] truncate">{startLabel}</span>
        <span className="min-w-0 max-w-[45%] truncate text-right">{endLabel}</span>
      </div>
      </div>
      <figcaption className="mt-1 text-xs text-[var(--text-dim)]">
        {caption} Faded bars are based on fewer than {minN} {unit}.
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
              { key: 'stop', header: 'Stop', rowHeader: true, className: 'font-normal', cell: r => r.p.label },
              { key: 'value', header: valueHeader, cell: r => formatY(r.p.y + (r.p.y2 ?? 0)) },
              ...(points.some(p => p.lo != null) ? [{ key: 'range', header: 'Most trips between', cell: (r: { p: ProfilePoint }) => (r.p.lo != null && r.p.hi != null ? `${formatY(r.p.lo)} and ${formatY(r.p.hi)}` : '') }] : []),
              { key: 'n', header: unit.charAt(0).toUpperCase() + unit.slice(1), cell: r => (r.p.n != null ? r.p.n.toLocaleString() : '') },
            ]}
          />
        </div>
      </details>
    </figure>
  );
}
