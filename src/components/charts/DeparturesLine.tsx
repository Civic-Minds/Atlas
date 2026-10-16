import type { CSSProperties } from 'react';

/**
 * The number of departures in each hour as a thin grey line over an hour chart's bars, on its own scale (no axis): the
 * busiest hour reaches 90% of the bar area. Breaks where an hour has no departures. `counts` follows the chart's axis.
 */
export default function DeparturesLine({ counts, style }: { counts: ReadonlyArray<number | null>; style?: CSSProperties }) {
  const max = Math.max(0, ...counts.map(c => c ?? 0));
  if (!max || counts.length < 2) return null;
  const runs: Array<Array<[number, number]>> = [];
  counts.forEach((c, i) => {
    if (c == null || c <= 0) { runs.push([]); return; }
    if (!runs.length) runs.push([]);
    runs[runs.length - 1].push([i + 0.5, 100 - (c / max) * 90]);
  });
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${counts.length} 100`} preserveAspectRatio="none" style={style}>
      {runs.filter(r => r.length > 1).map((r, k) => (
        <polyline key={k} points={r.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke="var(--text-dim)" strokeWidth={1.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity={0.8} />
      ))}
    </svg>
  );
}
