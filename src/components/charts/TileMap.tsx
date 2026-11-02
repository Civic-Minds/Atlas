import type { Key } from 'react';
import { CHART_COUNT, FADED_OPACITY, useActivePart } from './useActivePart';

/** One tile: where it sits, what it says and how it is drawn. */
export interface MapTile {
  key: Key;
  /** Short name in the tile's top line (a state or province code). */
  abbr: string;
  col: number;
  row: number;
  /** The figure in the middle (an age, "Mix", "–"). */
  value: string;
  /** The small number under it (agencies). */
  count: number;
  /** A colour, or "none" for an outline only. */
  fill: string;
  /** The fill is dark enough that the words need the panel colour. */
  darkFill?: boolean;
  /** Drawn with a dashed edge: the figure rests on very few agencies. */
  thin?: boolean;
  /** One sentence for screen readers. */
  sentence: string;
}

/**
 * A tile map: one equal square per place on a grid in rough geographic order, each with its short name, a figure and a
 * small count, in the split bar legend's text (CHART_TEXT's size and colour from sm up; smaller on phones, where a tile is
 * about 26px wide). Hovering, focusing or tapping a tile picks it the split bar's way (useActivePart): the others fade and
 * the picked one gets the accent outline (CIV-1282).
 */
export default function TileMap({ tiles, label, details }: {
  tiles: readonly MapTile[];
  /** The map's accessible name. */
  label: string;
  /** The id of the map's table for screen readers (ChartTableDetails), linked with aria-details. */
  details?: string;
}) {
  const { active, clear, faded, partEvents } = useActivePart();
  const cols = Math.max(...tiles.map(t => t.col)) + 1;
  const rows = Math.max(...tiles.map(t => t.row)) + 1;
  return (
    <div role="group" aria-label={label} aria-details={details} className="mt-4 grid w-full select-none gap-0.5 sm:gap-1"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, auto)` }} onMouseLeave={clear}>
      {/* In reading order (top row first), so Tab moves across the map rather than through the alphabet. */}
      {[...tiles].sort((a, b) => a.row - b.row || a.col - b.col).map(t => {
        const on = active === t.key;
        return (
          <button key={t.key} type="button" aria-label={t.sentence} {...partEvents(t.key)}
            className="relative aspect-square cursor-pointer rounded-md border-0 p-0 outline-none transition-opacity"
            style={{
              gridColumn: t.col + 1, gridRow: t.row + 1,
              background: t.fill === 'none' ? 'var(--bg-panel)' : t.fill,
              boxShadow: on ? 'inset 0 0 0 2px var(--accent)' : 'inset 0 0 0 1px var(--border-primary)',
              opacity: faded(t.key) ? FADED_OPACITY : undefined,
            }}>
            {/* Thin: a dashed edge in the words' colour, so it shows on light and dark fills alike. */}
            {t.thin && !on && <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-md border-[1.5px] border-dashed" style={{ borderColor: t.darkFill ? 'var(--bg-panel)' : 'var(--text-muted)' }} />}
            <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-[var(--text-primary)]"
              style={t.darkFill ? { color: 'var(--bg-panel)' } : undefined}>
              <span className="text-[10px] leading-3 sm:text-xs sm:leading-4">{t.abbr}</span>
              <span className={`text-[10px] leading-3 sm:text-sm sm:leading-5 ${t.value.length > 2 ? 'font-semibold sm:font-black' : CHART_COUNT}`}>{t.value}</span>
              <span className="hidden text-[10px] leading-3 sm:block">{t.count}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
