import { Z_PANEL } from '../../styles';

/** Basemap credit — must stay visible (CARTO + OpenStreetMap license). */
export function MapAttribution() {
  return (
    <div className={`absolute bottom-6 left-6 ${Z_PANEL} pointer-events-auto`}>
      <div className="flex items-center min-h-8 max-w-[min(18rem,calc(100vw-6rem))] bg-[var(--bg-panel)] backdrop-blur-md border border-[var(--border-primary)] rounded-full shadow-2xl px-3 py-1">
        <p className="text-[10px] font-bold leading-snug text-[var(--text-muted)] [&_a]:font-bold [&_a]:text-[var(--text-dim)] [&_a]:no-underline [&_a]:hover:text-[var(--text-primary)]">
          Map tiles by{' '}
          <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a>
          , under CC BY 3.0. Data by{' '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>
          , under ODbL.
        </p>
      </div>
    </div>
  );
}
