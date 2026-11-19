import type { ReactNode } from 'react';
import { MAP_BADGE, MAP_NOTICE_SLOT, Z_PANEL } from '../../styles';

/** The map's note, in the regular map's notice slot: Studio's pages on the main map, and the map apps' footer. */
export function MapNote({ children }: { children: ReactNode }) {
  return (
    <div data-map-overlay="notice" className={`${MAP_NOTICE_SLOT} ${Z_PANEL} pointer-events-none`}>
      <p className={`${MAP_BADGE} m-0 min-h-8 px-3 py-1.5 text-xs text-[var(--text-muted)]`}>{children}</p>
    </div>
  );
}
