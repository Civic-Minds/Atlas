import type { ReactNode, Ref } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { MAP_APP_SIDEBAR_SLOT } from '../../styles';

/** Wide screens (the sidebar floats over the map) from this width up; narrower, the panels sit under the map. */
export const MAP_APP_WIDE_QUERY = '(min-width: 1024px)';
export const useMapAppWide = () => useMediaQuery(MAP_APP_WIDE_QUERY);

/**
 * Pixels the map keeps clear when framing what it draws. Wide: the sidebar (24.5rem, its 1.5rem inset and a gap) on the
 * left; the key sits under the sidebar, and the footer row's height is added by framePadding.
 */
export const MAP_APP_PADDING = {
  wide: { top: 24, bottom: 24, left: 428, right: 24 },
  narrow: { top: 24, bottom: 24, left: 24, right: 24 },
} as const;

interface Props {
  wide: boolean;
  /** The map (MapAppMap), filling the body on wide screens, the top of the page on narrow ones. */
  map: ReactNode;
  /** The left column on wide screens (24.5rem): the panels. */
  sidebar: ReactNode;
  /** What sits under the map on narrow screens; the sidebar's own content laid out for the page. */
  narrowPanels: ReactNode;
  /** What floats over the map, each in the regular map's slot: the key (MapLegendCard), the footer (MapAppFooter). */
  overlay?: ReactNode;
  /** Rendered first, outside the layout (portals into the top bar). */
  portals?: ReactNode;
  /** The narrow page's scroll box, to bring the map back into view. */
  narrowScrollRef?: Ref<HTMLDivElement>;
}

/**
 * The body of a map-and-sidebar page. Wide: the map fills it and the sidebar and the overlay float over it, inset 12px.
 * Narrow (a tablet; phones never get here, MapAppShell): the map on top (55% of the screen, at least 22rem) with the
 * overlay over it, the panels under it; the page scrolls, no panel does.
 */
export function MapAppLayout({ wide, map, sidebar, narrowPanels, overlay, portals, narrowScrollRef }: Props) {
  if (!wide) {
    return (
      <div className="relative min-h-0 flex-1">
        {portals}
        <div ref={narrowScrollRef} className="absolute inset-0 overflow-y-auto">
          <div className="relative h-[55vh] min-h-[22rem]">
            <div className="absolute inset-0">{map}</div>
            <div className="pointer-events-none absolute inset-0">{overlay}</div>
          </div>
          {narrowPanels}
        </div>
      </div>
    );
  }
  return (
    <div className="relative min-h-0 flex-1">
      {portals}
      <div className="absolute inset-0">{map}</div>
      {/* The sidebar in its column, and the regular map's overlays in their own slots over the whole map (CIV-1821). */}
      <div className={`${MAP_APP_SIDEBAR_SLOT} pointer-events-auto flex w-[24.5rem] flex-col gap-2`}>{sidebar}</div>
      <div className="pointer-events-none absolute inset-0">{overlay}</div>
    </div>
  );
}
