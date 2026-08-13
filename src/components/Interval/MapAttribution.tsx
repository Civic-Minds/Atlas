import { MAP_BADGE, MAP_BADGE_LABEL, Z_PANEL } from '../../styles';

const ATTRIB_LINK =
  'text-[10px] font-normal leading-none text-[var(--text-dim)] no-underline hover:text-[var(--text-primary)]';

const FULL_ATTRIBUTION =
  'Map tiles by CARTO, under CC BY 3.0. Data by OpenStreetMap, under ODbL.';

/** Basemap credit — linked names satisfy OSM + CARTO attribution requirements. */
export function MapAttribution() {
  return (
    <div
      className={`absolute bottom-6 left-6 ${Z_PANEL} pointer-events-auto`}
      title={FULL_ATTRIBUTION}
    >
      <div className={`${MAP_BADGE} h-8`}>
        <p className={`${MAP_BADGE_LABEL} whitespace-nowrap leading-none`}>
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
            className={ATTRIB_LINK}
          >
            OpenStreetMap
          </a>
          <span className={MAP_BADGE_LABEL}> · </span>
          <a
            href="https://carto.com/attributions"
            target="_blank"
            rel="noopener noreferrer"
            className={ATTRIB_LINK}
          >
            CARTO
          </a>
        </p>
      </div>
    </div>
  );
}
