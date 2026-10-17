import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { WidgetSize } from './Widget';

export interface PanelWidget {
  key: string;
  size: WidgetSize;
  /** Figure tiles are list items; they sit in a list of their own. */
  tile?: boolean;
  node: ReactNode;
}

const GAP = 12;
const MIN_UNIT = 148;
const PAGER = 28;
const UNITS: Record<WidgetSize, [number, number]> = { small: [1, 1], medium: [2, 1], large: [2, 2] };

/**
 * Packs widgets, in priority order, into pages of a two-column grid that is `rows` units tall: each widget takes the
 * first free place that fits, and what does not fit goes to the next page. A later, smaller widget can fill a gap.
 */
export function packWidgets(widgets: readonly PanelWidget[], rows: number): Array<Array<{ w: PanelWidget; col: number; row: number }>> {
  const pages: Array<Array<{ w: PanelWidget; col: number; row: number }>> = [];
  const taken: boolean[][][] = [];
  const free = (g: boolean[][], c: number, r: number, cw: number, rh: number) => { for (let i = r; i < r + rh; i++) for (let j = c; j < c + cw; j++) if (g[i][j]) return false; return true; };
  for (const w of widgets) {
    const [cw, rh] = UNITS[w.size];
    let placed = false;
    for (let p = 0; p <= pages.length && !placed; p++) {
      if (p === pages.length) { pages.push([]); taken.push(Array.from({ length: rows }, () => [false, false])); }
      const g = taken[p];
      for (let r = 0; r + rh <= rows && !placed; r++) for (let c = 0; c + cw <= 2 && !placed; c++) {
        if (!free(g, c, r, cw, rh)) continue;
        for (let i = r; i < r + rh; i++) for (let j = c; j < c + cw; j++) g[i][j] = true;
        pages[p].push({ w, col: c, row: r });
        placed = true;
      }
    }
  }
  return pages;
}

/**
 * The widget panel: a two-column grid sized to the window so it never scrolls. The most useful widgets sit on the first
 * page; when the window is too short for all of them the rest go to further pages, reached by the dots under the grid.
 */
export default function WidgetPanel({ widgets, className = '', rows: fixedRows, swipe = false }: { widgets: readonly PanelWidget[]; className?: string; /** A fixed number of rows (a narrow screen, where the panel sits under the map and has its own height) instead of filling the height it is given. */ rows?: number; /** The pages sit side by side and swipe, instead of replacing one another. */ swipe?: boolean }) {
  const box = useRef<HTMLDivElement | null>(null);
  const [h, setH] = useState(0);
  const [page, setPage] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => setH(el.clientHeight);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const grid = h - PAGER;
  const rows = fixedRows ?? Math.max(1, Math.floor((grid + GAP) / (MIN_UNIT + GAP)));
  const unit = fixedRows ? MIN_UNIT : rows > 0 ? (grid - (rows - 1) * GAP) / rows : MIN_UNIT;
  const pages = useMemo(() => packWidgets(widgets, rows), [widgets, rows]);
  useEffect(() => { setPage(p => Math.min(p, Math.max(0, pages.length - 1))); }, [pages.length]);
  const strip = useRef<HTMLDivElement | null>(null);
  const goTo = (i: number) => { setPage(i); if (swipe && strip.current) strip.current.scrollTo({ left: i * strip.current.clientWidth, behavior: 'smooth' }); };
  const place = (items: Array<{ w: PanelWidget; col: number; row: number }>) => items.map(({ w, col, row }) => {
    const [cw, rh] = UNITS[w.size];
    const style = { gridColumn: `${col + 1} / span ${cw}`, gridRow: `${row + 1} / span ${rh}` };
    return w.tile
      ? <ul key={w.key} className="m-0 flex min-h-0 list-none p-0 [&>li]:flex-1" style={style}>{w.node}</ul>
      : <div key={w.key} className="flex min-h-0 [&>section]:flex-1" style={style}>{w.node}</div>;
  });
  const gridStyle = { gridTemplateRows: `repeat(${rows}, ${Math.max(unit, 0)}px)` };
  return (
    <div ref={box} className={`flex min-h-0 flex-col ${className}`.trim()}>
      {swipe ? (
        <div ref={strip} onScroll={e => setPage(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))} className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {pages.map((items, i) => <div key={i} className="grid w-full shrink-0 snap-center grid-cols-2 gap-3" style={gridStyle}>{place(items)}</div>)}
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-3" style={gridStyle}>{place(pages[Math.min(page, Math.max(0, pages.length - 1))] ?? [])}</div>
      )}
      <div className="flex h-7 shrink-0 items-center justify-center gap-2">
        {pages.length > 1 && pages.map((_, i) => (
          <button key={i} type="button" aria-label={`Page ${i + 1} of ${pages.length}`} aria-current={i === page ? 'true' : undefined} onClick={() => goTo(i)}
            className={`h-2 w-2 rounded-full ${i === page ? 'bg-[var(--text-secondary)]' : 'bg-[var(--border-primary)]'}`} />
        ))}
      </div>
    </div>
  );
}
