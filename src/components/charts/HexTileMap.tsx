import type { Key } from 'react';
import { CHART_COUNT, FADED_OPACITY, useActivePart } from './useActivePart';

/** One hex: where it sits, what it says and how it is drawn. */
export interface HexTile {
  key: Key;
  /** Short name in the hex's top line (a state or province code). */
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
  /** Drawn with a dashed line inside its edge: the figure rests on very few agencies. */
  thin?: boolean;
  /** One sentence for screen readers. */
  sentence: string;
}

/** Pointy-top hex in a 100-wide box: the height is 2/√3 of the width. */
const HEX_H = 200 / Math.sqrt(3);
const HEX_POINTS = `50,0 100,${HEX_H / 4} 100,${(HEX_H * 3) / 4} 50,${HEX_H} 0,${(HEX_H * 3) / 4} 0,${HEX_H / 4}`;
/** Each hex is drawn a little smaller than its cell, so neighbours keep a gap. */
const INSET = 0.93;
/** Where a thin hex's dashed line sits. */
const THIN_INSET = 0.84;

/**
 * A tile map: one equal hex per place on a standard offset hex grid (odd rows half a hex to the right), each with its
 * short name, a figure and a small count, in the split bar legend's text (CHART_TEXT's size and colour from sm up; smaller on
 * phones, where a hex is about 26px wide). Hovering, focusing or tapping a hex picks it the
 * split bar's way (useActivePart): the others fade and the picked one gets the accent outline (CIV-1282).
 */
export default function HexTileMap({ tiles, label, details }: {
  tiles: readonly HexTile[];
  /** The map's accessible name. */
  label: string;
  /** The id of the map's table for screen readers (ChartTableDetails), linked with aria-details. */
  details?: string;
}) {
  const { active, clear, faded, partEvents } = useActivePart();
  const cols = Math.max(...tiles.map(t => t.col + (t.row % 2 ? 0.5 : 0))) + 1;
  const rows = Math.max(...tiles.map(t => t.row));
  // In hex widths: rows step down three quarters of a hex's height.
  const h = HEX_H / 100;
  const height = rows * 0.75 * h + h;
  return (
    <div role="group" aria-label={label} aria-details={details} className="relative mt-4 w-full select-none" style={{ aspectRatio: `${cols} / ${height}` }} onMouseLeave={clear}>
      {/* In reading order (top row first), so Tab moves across the map rather than through the alphabet. */}
      {[...tiles].sort((a, b) => a.row - b.row || a.col - b.col).map(t => {
        const x = t.col + (t.row % 2 ? 0.5 : 0);
        const y = t.row * 0.75 * h;
        const on = active === t.key;
        return (
          <button key={t.key} type="button" aria-label={t.sentence} {...partEvents(t.key)}
            className="group pointer-events-none absolute border-0 bg-transparent p-0 outline-none"
            style={{ left: `${(x / cols) * 100}%`, top: `${(y / height) * 100}%`, width: `${(1 / cols) * 100}%`, height: `${(h / height) * 100}%`, opacity: faded(t.key) ? FADED_OPACITY : undefined }}>
            <svg viewBox={`0 0 100 ${HEX_H}`} className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
              <polygon points={HEX_POINTS} transform={`translate(${50 * (1 - INSET)} ${(HEX_H / 2) * (1 - INSET)}) scale(${INSET})`}
                className="pointer-events-auto cursor-pointer transition-opacity"
                style={{ fill: t.fill === 'none' ? 'var(--bg-panel)' : t.fill }}
                stroke={on ? 'var(--accent)' : 'var(--border-primary)'} strokeWidth={on ? 2.5 : 1} vectorEffect="non-scaling-stroke" />
              {/* Thin: a dashed line just inside the edge, in the words' colour, so it shows on light and dark fills alike. */}
              {t.thin && <polygon points={HEX_POINTS} transform={`translate(${50 * (1 - THIN_INSET)} ${(HEX_H / 2) * (1 - THIN_INSET)}) scale(${THIN_INSET})`}
                fill="none" stroke={t.darkFill ? 'var(--bg-panel)' : 'var(--text-muted)'} strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" className="pointer-events-none" />}
            </svg>
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
