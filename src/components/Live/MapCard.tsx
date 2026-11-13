import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cardTop } from './cardPlacement';
import type { CardGroup } from './stopCardModel';

/**
 * The Live maps' stop card and hover name (the tool's route map and the report pages' late-stops map, CIV-1405), shared
 * so the two maps show a stop the same way.
 */

/** The compact card shown on the map at the picked stop or segment. */
export function MapCard({ title, lines = [], groups = [] }: { title: string; lines?: string[]; /** Labelled groups of lines (the stop card). */ groups?: CardGroup[] }) {
  return (
    <div className="space-y-0.5 p-3 text-xs">
      <div className="text-sm font-bold leading-snug">{title}</div>
      {lines.map(l => <div key={l} className="text-[var(--text-secondary)]">{l}</div>)}
      {groups.map((g, i) => (
        <div key={g.heading ?? i} className="pt-1.5">
          {g.heading && <div className="font-bold text-[var(--text-muted)]">{g.heading}</div>}
          {g.lines.map(l => <div key={l} className="text-[var(--text-secondary)]">{l}</div>)}
        </div>
      ))}
    </div>
  );
}

/** Where the card points: the picked point on screen, and the map's size. */
export type MapCardAt = { x: number; y: number; w: number; h: number };

/** The card floating over the map at `at`, kept wholly inside the map (#1151) and clear of `padding` top and bottom. */
export function FloatingMapCard({ at, padding, children }: { at: MapCardAt; padding?: { top: number; bottom: number }; children: ReactNode }) {
  // The card's own height, so it is placed wholly inside the map (#1151: on a phone it ran off the bottom).
  const [cardH, setCardH] = useState(0);
  const cardRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => { const h = cardRef.current?.offsetHeight ?? 0; if (h !== cardH) setCardH(h); });
  return (
    <div ref={cardRef} className="absolute z-20 rounded-2xl border border-[var(--border-primary)] bg-[var(--bg-header)] shadow-2xl"
      style={{ left: Math.max(8, Math.min(at.w - 260 - 8, at.x - 130)), top: cardTop(at.y, cardH, at.h, padding?.top ?? 8, padding?.bottom ?? 8), width: 260 }}>
      {children}
    </div>
  );
}

/** The name shown beside the pointer over a stop or segment. */
export function MapHoverTip({ x, y, text }: { x: number; y: number; text: string }) {
  return <div className="pointer-events-none absolute z-20 whitespace-nowrap rounded-md border border-[var(--border-primary)] bg-[var(--bg-header)] px-2 py-1 text-xs font-bold shadow-sm" style={{ left: x + 12, top: y + 12 }}>{text}</div>;
}
