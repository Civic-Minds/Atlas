import type { ViewportBounds } from '../hooks/useIntervalStats';

/** The slice of a MapLibre map the compare link needs (so it can be tested without a real map). */
export interface LinkableMap {
  getCenter(): { lat: number; lng: number };
  getZoom(): number;
  getBearing(): number;
  getPitch(): number;
  jumpTo(options: { center: { lat: number; lng: number }; zoom: number; bearing: number; pitch: number }): unknown;
  on(type: 'move', listener: () => void): unknown;
  off(type: 'move', listener: () => void): unknown;
}

/**
 * Links the two compare maps: whichever one the user moves, the other follows. On link, B snaps to
 * A's view (A leads). Returns the function that unlinks them; after that each map moves alone.
 */
export function linkCompareMaps(a: LinkableMap, b: LinkableMap): () => void {
  let syncing = false;
  const follow = (from: LinkableMap, to: LinkableMap) => () => {
    if (syncing) return;
    syncing = true;
    try {
      to.jumpTo({ center: from.getCenter(), zoom: from.getZoom(), bearing: from.getBearing(), pitch: from.getPitch() });
    } finally {
      syncing = false;
    }
  };
  const aToB = follow(a, b);
  const bToA = follow(b, a);
  aToB();
  a.on('move', aToB);
  b.on('move', bToA);
  return () => {
    a.off('move', aToB);
    b.off('move', bToA);
  };
}

/**
 * The view side B's data comes from. Linked, B shows what A shows. Unlinked, B has its own view and
 * must load for it (never A's), and A's view is never read from B (B reports its own bounds only).
 */
export function compareSideBView(
  linked: boolean,
  a: { bounds: ViewportBounds | null; zoom: number },
  b: { bounds: ViewportBounds | null; zoom: number | undefined },
): { bounds: ViewportBounds | null; zoom: number } {
  if (linked || !b.bounds) return a;
  return { bounds: b.bounds, zoom: b.zoom ?? a.zoom };
}
