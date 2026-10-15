export interface StackColumn {
  label: string;
  n: number;
  /** Shares of n, bottom to top; they add up to 1. */
  parts: readonly number[];
}

export interface StackPart {
  name: string;
  /** CSS colour (a token). */
  color: string;
}

const W = 640, H = 150, PAD_L = 8, PAD_B = 18;

/** Columns that each split into shares (for example early / on time / late per hour). Inline SVG, tokens only. */
export default function StackedBars({ columns, parts, ariaLabel }: { columns: readonly StackColumn[]; parts: readonly StackPart[]; ariaLabel: string }) {
  if (!columns.length) return null;
  const slot = (W - PAD_L * 2) / columns.length;
  const bw = Math.max(4, slot * 0.7);
  const plotH = H - PAD_B;
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="block h-auto w-full">
        <title>{ariaLabel}</title>
        {columns.map((c, i) => {
          let top = plotH;
          return (
            <g key={c.label}>
              {c.parts.map((share, k) => {
                const h = share * plotH;
                top -= h;
                return <rect key={parts[k].name} x={PAD_L + i * slot + (slot - bw) / 2} y={top} width={bw} height={Math.max(0, h)} fill={parts[k].color}>
                  <title>{`${c.label}: ${parts[k].name} ${Math.round(share * 100)}% (${c.n} departures)`}</title>
                </rect>;
              })}
              {i % 3 === 0 && <text x={PAD_L + i * slot + slot / 2} y={H - 4} textAnchor="middle" fontSize="13" fill="var(--text-dim)">{c.label}</text>}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
        {parts.map(p => <span key={p.name} className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} aria-hidden="true" />{p.name}</span>)}
      </figcaption>
    </figure>
  );
}
