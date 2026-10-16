import type { ReactNode } from 'react';
import { TILE } from '../../../pageStyles';

/** The fixed widget sizes, in grid units of a two-column panel: small is one unit, medium two across, large two by two. */
export type WidgetSize = 'small' | 'medium' | 'large';

/**
 * A widget bigger than a figure tile: the same surface, radius, padding, border and title as the Live figure tiles
 * (TILE), with a chart or a list as its one thing. Small figure tiles are KpiTile itself.
 */
export default function Widget({ title, size: _size = 'medium', children, className = '' }: { title: string; size?: WidgetSize; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={`${TILE} flex h-full min-h-0 flex-col overflow-hidden ${className}`.trim()}>
      <h3 className="m-0 shrink-0 truncate text-sm font-bold text-[var(--text-muted)]">{title}</h3>
      <div className="mt-2 min-h-0 flex-1 overflow-hidden">{children}</div>
    </section>
  );
}
