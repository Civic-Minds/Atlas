export interface LinePoint {
  /** Stop or hour name: shown in the point's tooltip and read by screen readers. */
  label: string;
  y: number;
  /** Optional band (for example the 10th to 90th percentile). */
  lo?: number;
  hi?: number;
  /** Sample size, shown in the tooltip. */
  n?: number;
}

export interface LineMark {
  /** Index of the point the mark sits on. */
  index: number;
  label: string;
}

interface LineChartProps {
  points: readonly LinePoint[];
  /** Describes the chart to screen readers. */
  ariaLabel: string;
  formatY: (y: number) => string;
  /** Marks (dashed vertical line with a label), for example where delays start. */
  marks?: readonly LineMark[];
  /** Draw a line at this y value (for example 0 = on time). */
  baseline?: number;
  /** Names for the two ends of the x axis (route ends). */
  startLabel?: string;
  endLabel?: string;
}

const W = 640, H = 180, PAD_L = 44, PAD_R = 12, PAD_T = 16, PAD_B = 20;

/** Small inline-SVG line chart with an optional band and marks, in the app's colour tokens. One point per stop, evenly spaced. */
export default function LineChart({ points, ariaLabel, formatY, marks = [], baseline, startLabel, endLabel }: LineChartProps) {
  if (points.length < 2) return null;
  const ys = points.flatMap(p => [p.y, p.lo ?? p.y, p.hi ?? p.y]).concat(baseline != null ? [baseline] : []);
  let min = Math.min(...ys), max = Math.max(...ys);
  if (max - min < 1e-6) { max = min + 1; }
  const pad = (max - min) * 0.1;
  min -= pad; max += pad;
  const x = (i: number) => PAD_L + (i / (points.length - 1)) * (W - PAD_L - PAD_R);
  const y = (v: number) => PAD_T + (1 - (v - min) / (max - min)) * (H - PAD_T - PAD_B);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
  const hasBand = points.every(p => p.lo != null && p.hi != null);
  const band = hasBand
    ? `${points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.hi!).toFixed(1)}`).join(' ')} ${[...points].reverse().map((p, i) => `L${x(points.length - 1 - i).toFixed(1)},${y(p.lo!).toFixed(1)}`).join(' ')} Z`
    : null;
  const ticks = [min + pad, (min + max) / 2, max - pad];
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="block h-auto w-full" preserveAspectRatio="xMidYMid meet">
        <title>{ariaLabel}</title>
        {ticks.map(t => (
          <g key={t}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)} stroke="var(--border-primary)" strokeWidth="1" />
            <text x={PAD_L - 6} y={y(t) + 4} textAnchor="end" fontSize="14" fill="var(--text-dim)">{formatY(t)}</text>
          </g>
        ))}
        {baseline != null && <line x1={PAD_L} x2={W - PAD_R} y1={y(baseline)} y2={y(baseline)} stroke="var(--text-dim)" strokeWidth="1" strokeDasharray="2 3" />}
        {band && <path d={band} fill="var(--accent)" opacity="0.15" />}
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={`${p.label}-${i}`} cx={x(i)} cy={y(p.y)} r="3" fill="var(--accent)">
            <title>{`${p.label}: ${formatY(p.y)}${p.n != null ? ` (${p.n} runs)` : ''}`}</title>
          </circle>
        ))}
        {marks.map(m => (
          <g key={`${m.index}-${m.label}`}>
            <line x1={x(m.index)} x2={x(m.index)} y1={PAD_T - 4} y2={H - PAD_B} stroke="var(--status-caution)" strokeWidth="1.5" strokeDasharray="4 3" />
            <text x={Math.min(Math.max(x(m.index), PAD_L + 40), W - PAD_R - 40)} y={PAD_T - 6} textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--status-caution-text)">{m.label}</text>
          </g>
        ))}
        {startLabel && <text x={PAD_L} y={H - 4} fontSize="14" fill="var(--text-dim)">{startLabel}</text>}
        {endLabel && <text x={W - PAD_R} y={H - 4} textAnchor="end" fontSize="14" fill="var(--text-dim)">{endLabel}</text>}
      </svg>
    </figure>
  );
}
