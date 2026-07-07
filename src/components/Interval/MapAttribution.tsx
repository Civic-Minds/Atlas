import { MAP_BADGE, MAP_BADGE_LABEL, Z_PANEL } from '../../styles';

const ATTRIB_LINK =
  'text-[10px] font-normal leading-none text-[var(--text-dim)] no-underline hover:text-[var(--text-primary)]';

/** Basemap credit — label-sized type matching the “routes” word in stats badges. */
export function MapAttribution() {
  return (
    <div className={`absolute bottom-6 left-6 ${Z_PANEL} pointer-events-auto`}>
      <div className={`${MAP_BADGE} h-8 max-w-[calc(100vw-3rem)]`}>
        <p className={`${MAP_BADGE_LABEL} whitespace-nowrap leading-none`}>
          Map tiles by{' '}
          <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer" className={ATTRIB_LINK}>CARTO</a>
          , under CC BY 3.0. Data by{' '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className={ATTRIB_LINK}>OpenStreetMap</a>
          , under ODbL.
        </p>
      </div>
    </div>
  );
}
