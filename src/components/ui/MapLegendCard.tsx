import { useEffect, useRef, type ReactNode } from 'react';
import { FLOATING_CARD, MAP_LEGEND_SLOT, Z_MAP_OVERLAY } from '../../styles';
import { MAP_OVERLAY_VARS, publishMapOverlayVar } from '../../mapOverlayLayout';

/**
 * The map key's card in its slot: bottom left, above the footer row (MAP_LEGEND_SLOT). The regular map's key and every
 * map app's key (Studio, the Live tool, CIV-1821) sit in it, so a key is never placed anywhere else. It publishes its
 * height plus a gap (--map-key-h) so the notice pill and the map apps' sidebar stop above it (CIV-1136).
 */
export function MapLegendCard({ label, className = 'w-72', children }: { label: string; /** Width; the regular map's is w-72. */ className?: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => publishMapOverlayVar(MAP_OVERLAY_VARS.keyHeight, `${Math.round(el.getBoundingClientRect().height) + 8}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => { observer.disconnect(); publishMapOverlayVar(MAP_OVERLAY_VARS.keyHeight, null); };
  }, []);
  return (
    <aside
      ref={ref}
      aria-label={label}
      data-map-overlay="legend"
      className={`${FLOATING_CARD} ${MAP_LEGEND_SLOT} ${Z_MAP_OVERLAY} ${className} max-w-[calc(100vw-2.5rem)] p-3 pointer-events-auto`}
    >
      {children}
    </aside>
  );
}
