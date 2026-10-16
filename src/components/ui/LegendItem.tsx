import type { ReactNode } from 'react';

const SWATCH = {
  /** A short line: the key for something drawn as a line on the map (routes, night service). */
  line: 'h-1 w-3 rounded-full',
  /** A round dot: the key for bars, segments and counts. */
  dot: 'h-2 w-2 rounded-full',
} as const;

/** One legend entry: a coloured swatch and its label. Every legend (map, research, charts, agency pages) uses this. */
export default function LegendItem({ color, kind = 'dot', className = '', children }: { color: string; kind?: keyof typeof SWATCH; className?: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`.trim()}>
      <span aria-hidden="true" className={`${SWATCH[kind]} shrink-0`} style={{ background: color }} />
      {children}
    </span>
  );
}
