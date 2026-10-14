import { useEffect, useRef, useState } from 'react';

/**
 * Opens once the map tiles have loaded and settled (or after `maxWaitMs`, so stalled tiles cannot
 * hold back the agency data the map falls back to). It stays open once it opens.
 */
export function useViewportLoadGate(tilesLoading: boolean, { settleMs = 250, maxWaitMs = 8000 } = {}): boolean {
  const [open, setOpen] = useState(false);
  const tilesStarted = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setOpen(true), maxWaitMs);
    return () => clearTimeout(timer);
  }, [maxWaitMs]);

  useEffect(() => {
    if (tilesLoading) {
      tilesStarted.current = true;
      return;
    }
    if (!tilesStarted.current) return;
    const timer = setTimeout(() => setOpen(true), settleMs);
    return () => clearTimeout(timer);
  }, [tilesLoading, settleMs]);

  return open;
}
