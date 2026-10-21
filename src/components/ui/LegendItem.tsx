import type { ReactNode } from 'react';

const SWATCH = {
  /** A short line: the key for something drawn as a line on the map (routes, night service). */
  line: 'h-1 w-3 rounded-full',
  /** A round dot: the key for bars, segments and counts. */
  dot: 'h-2 w-2 rounded-full',
  /** A small filled square with a thin border: the key for a shaded area (the population / income scale). */
  square: 'h-2.5 w-2.5 rounded-[2px] border border-[var(--border-primary)]',
} as const;

/** One legend entry: a coloured swatch and its label. Every legend (map, research, charts, agency pages) uses this. */
export default function LegendItem({ color, kind = 'dot', className = '', swatchClassName = '', children }: { color: string; kind?: keyof typeof SWATCH; className?: string; /** Extra classes for the swatch alone (for example a faded one). */ swatchClassName?: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`.trim()}>
      <span aria-hidden="true" className={`${SWATCH[kind]} shrink-0 ${swatchClassName}`.trim()} style={{ background: color }} />
      {children}
    </span>
  );
}
