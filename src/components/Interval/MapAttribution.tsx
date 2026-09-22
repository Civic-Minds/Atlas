import { MAP_BADGE, MAP_BADGE_LABEL, Z_PANEL } from '../../styles';

const ATTRIB_LINK =
  `${MAP_BADGE_LABEL} text-[var(--text-dim)] no-underline hover:text-[var(--text-primary)]`;

const FULL_ATTRIBUTION =
  'Map tiles by CARTO, under CC BY 3.0. Data by OpenStreetMap, under ODbL.';

/** Basemap credit — linked names satisfy OSM + CARTO attribution requirements. */
export function MapAttribution() {
  const feedbackHref = `mailto:hey@ryanisnota.pro?subject=Atlas%20Feedback&body=${encodeURIComponent(`Page: ${window.location.href}\n\n`)}`;

  return (
    <div
      className={`absolute bottom-6 left-6 ${Z_PANEL} pointer-events-auto flex items-center gap-1.5`}
      title={FULL_ATTRIBUTION}
    >
      <a
        href={feedbackHref}
        className={`${MAP_BADGE} h-8 ${MAP_BADGE_LABEL} no-underline hover:text-[var(--text-primary)]`}
      >
        Feedback
      </a>
      <div className={`${MAP_BADGE} h-8`}>
        <p className={`${MAP_BADGE_LABEL} whitespace-nowrap`}>
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
