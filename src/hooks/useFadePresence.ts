import { useEffect, useState } from 'react';

/** How long a closing panel fades before it leaves the page: the map card's 200ms (TRANSITION_BASE). */
export const FADE_OUT_MS = 200;

/**
 * Keeps a panel on the page while it fades out. `mounted` turns on with `open` and stays on for
 * `fadeOutMs` after `open` turns off; `visible` turns on just after mounting (so the fade-in runs)
 * and off as soon as `open` does. Used by the map's sidebar card and History's panels.
 */
export function useFadePresence(open: boolean, fadeOutMs = FADE_OUT_MS): { mounted: boolean; visible: boolean } {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = setTimeout(() => setVisible(true), 10);
      return () => clearTimeout(id);
    }
    setVisible(false);
    const id = setTimeout(() => setMounted(false), fadeOutMs);
    return () => clearTimeout(id);
  }, [open, fadeOutMs]);
  return { mounted, visible };
}
