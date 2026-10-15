export interface ProfilePoint {
  /** Stop or stretch name: shown in the tooltip. */
  label: string;
  y: number;
  /** Optional range drawn as a thin line through the bar (for example where 8 in 10 cars fall). */
  lo?: number;
  hi?: number;
  /** Sample size, shown in the tooltip. */
  n?: number;
}

export interface ProfileMark {
  index: number;
  label: string;
}

const H = 96;

/**
 * One bar per stop along the route, in the same shape as the route card's schedule sparkline: narrow rounded bars at
 * 90% opacity with a small gap, the accent colour for the bars and the caution colour for the marked one, and small
 * muted labels under the ends. Values below zero hang under a dashed zero line.
 */
export default function ProfileBars({ points, ariaLabel, formatY, marks = [], zero = false, startLabel, endLabel, unit, minN = 30 }: {
  points: readonly ProfilePoint[]; ariaLabel: string; formatY: (y: number) => string; marks?: readonly ProfileMark[];
  /** Draw a dashed zero line (for delays, where early is below it). */
  zero?: boolean; startLabel?: string; endLabel?: string;
  /** What `n` counts (runs, gaps): bars with fewer than `minN` fade, and one caption says so. */
  unit: string; minN?: number;
}) {
  if (points.length < 2) return null;
  const hi = Math.max(0, ...points.map(p => Math.max(p.y, p.hi ?? p.y)));
  const lo = Math.min(0, ...points.map(p => Math.min(p.y, p.lo ?? p.y)));
  const span = hi - lo || 1;
  const pos = (v: number) => ((v - lo) / span) * H; // px from the bottom
  const zeroPx = pos(0);
  const text = (p: ProfilePoint) => `${p.label}: ${formatY(p.y)}${p.n != null ? ` (${p.n.toLocaleString()} ${unit})` : ''}`;
  const markAt = new Map(marks.map(m => [m.index, m.label]));
  return (
    <figure className="m-0" role="img" aria-label={ariaLabel}>
      <div className="mb-1 flex justify-between text-xs text-[var(--text-dim)]" aria-hidden="true">
        <span>{formatY(hi)}</span>
        {lo < 0 && <span>{formatY(lo)}</span>}
      </div>
      <div className="relative flex gap-px" style={{ height: H }}>
        {zero && lo < 0 && <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[var(--text-dim)] opacity-60" style={{ bottom: zeroPx }} />}
        {points.map((p, i) => {
          const marked = markAt.has(i);
          const top = pos(Math.max(p.y, 0));
          const bottom = pos(Math.min(p.y, 0));
          return (
            <div key={`${p.label}-${i}`} className="relative h-full min-w-0 flex-1" tabIndex={0} title={text(p)} aria-label={text(p)}>
              <div
                className={`absolute left-1/2 w-[60%] max-w-[14px] min-w-[3px] -translate-x-1/2 rounded-sm ${p.n != null && p.n < minN ? 'opacity-40' : 'opacity-90'}`}
                style={{ bottom, height: Math.max(2, top - bottom), background: marked ? 'var(--status-caution)' : 'var(--accent)' }}
              />
              {p.lo != null && p.hi != null && (
                <div className="absolute left-1/2 w-px -translate-x-1/2 bg-[var(--text-muted)] opacity-70" style={{ bottom: pos(p.lo), height: Math.max(1, pos(p.hi) - pos(p.lo)) }} />
              )}
              {marked && (
                <span className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-bold text-[var(--status-caution-text)]">{markAt.get(i)}</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-xs text-[var(--text-dim)]" aria-hidden="true">
        <span>{startLabel}</span>
        <span>{endLabel}</span>
      </div>
      <figcaption className="mt-1 text-xs text-[var(--text-dim)]">Faded bars are based on fewer than {minN} {unit}.</figcaption>
    </figure>
  );
}
