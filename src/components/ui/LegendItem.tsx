import type { ReactNode } from 'react';

const SWATCH = {
  /** A short line: the key for something drawn as a line on the map (routes, night service). */
  line: 'h-1 w-3 rounded-full',
  /** A round dot: the key for bars, segments and counts. */
  dot: 'h-2 w-2 rounded-full',
} as const;

/** One legend entry: a coloured swatch and its label. Every legend (map, research, charts, agency pages) uses this. */
export default function LegendItem({ color, kind = 'dot', className = '', swatchClassName = '', children }: { color: string; kind?: keyof typeof SWATCH; className?: string; /** Extra classes for the swatch alone (for example a faded one). */ swatchClassName?: string; children: ReactNode }) {
  // A caller's own display class (`flex` for a full-width row) replaces the default inline-flex; with both,
  // the stylesheet's order decided and inline-flex won, so rows meant to stack ran together (CIV-1070).
  const display = /(^|\s)(flex|grid|block)(\s|$)/.test(className) ? '' : 'inline-flex ';
  return (
    <span className={`${display}items-center gap-1.5 ${className}`.trim()}>
      <span aria-hidden="true" className={`${SWATCH[kind]} shrink-0 ${swatchClassName}`.trim()} style={{ background: color }} />
      {children}
    </span>
  );
}
