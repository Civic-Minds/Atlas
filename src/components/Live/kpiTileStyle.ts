import { TILE } from '../../pageStyles';

/** The one Live figure tile (KpiTile, and the late-by-hour tiles): its frame, title, big figure and caption lines. */
export const KPI_TILE = {
  frame: `${TILE} flex list-none flex-col px-2.5`,
  label: 'text-sm font-bold text-[var(--text-muted)]',
  value: 'mt-1 text-3xl font-black tracking-tight',
  /** A caption line under the figure (and any line after it). */
  line: 'mt-0.5 text-xs leading-4 text-[var(--text-dim)]',
} as const;
