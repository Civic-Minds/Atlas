import { Z_PANEL } from '../../styles';

const FULL_ATTRIBUTION =
  'Map tiles by CARTO, under CC BY 3.0. Data by OpenStreetMap, under ODbL.';

/** Basemap credit — same two-weight pill pattern as “39 routes” (count + label). */
export function MapAttribution() {
  return (
    <div
      className={`absolute bottom-6 left-6 ${Z_PANEL} pointer-events-auto`}
      title={FULL_ATTRIBUTION}
    >
      <div className="flex h-8 items-center gap-1.5 whitespace-nowrap bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)] rounded-full shadow-2xl px-3">
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-black text-[var(--text-primary)] hover:opacity-80"
        >
          OpenStreetMap
        </a>
        <span className="text-[10px] font-bold text-[var(--text-muted)]">·</span>
        <a
          href="https://carto.com/attributions"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] font-bold text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          CARTO
        </a>
      </div>
    </div>
  );
}
