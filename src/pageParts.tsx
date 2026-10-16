import { useState } from 'react';
import { FREQUENCY_BANDS, NO_MIDDAY_PHRASE, NO_MIDDAY_SHORT, allRoutesMapHref } from '../shared/agencyPages';
import ArrowLink from './components/ui/ArrowLink';
import { useHeadwayTiers } from './hooks/useHeadwayTiers';
import LegendItem from './components/ui/LegendItem';
import { plural } from '../shared/overflowText';
import { routeLabels } from './utils/format';

const BAND_PHRASES = [...FREQUENCY_BANDS.map(b => b.phrase), NO_MIDDAY_PHRASE];
const BAND_SHORT = [...FREQUENCY_BANDS.map(b => b.short), NO_MIDDAY_SHORT];
/** The map's own frequency colours (same bands and edges as the filters, in the colour-vision palette), then the neutral no-service grey. */
const NO_SERVICE_FILL = 'var(--control-inactive-bg)';

/**
 * One flat stacked bar of route counts per weekday-midday frequency band. The legend is one short wrapping line.
 * Hovering, focusing or tapping a segment highlights its legend item and fades the other segments; hovering,
 * focusing or tapping a legend item does the same in reverse (both use the pointer cursor). Each segment keeps its aria-label (count and band).
 */
export function FrequencyBar({ counts, mapHref }: { counts: number[]; /** The page's map link: the one link under the bar opens the map with these routes (Weekday midday). The bar itself is not clickable. */ mapHref?: string }) {
  const [active, setActive] = useState<number | null>(null);
  const BAND_FILLS = [...useHeadwayTiers().map(t => t.color), NO_SERVICE_FILL];
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const shown = counts.map((n, i) => ({ n, i })).filter(x => x.n > 0);
  // The unit goes on the first visible frequency band (not on "no midday"), so the row never reads "3 31–60" bare.
  const unitBand = shown.find(x => x.i < BAND_SHORT.length - 1)?.i;
  const sentence = (x: { n: number; i: number }) => `${x.n} ${plural(x.n, 'route')} ${BAND_PHRASES[x.i]}`;
  const faded = (i: number) => active !== null && active !== i;
  return (
    <div className="mt-5">
      <div onMouseLeave={() => setActive(null)}>
        <div role="group" aria-label="Routes by weekday midday frequency" className="flex h-4 gap-0.5 overflow-hidden rounded-full">
          {shown.map(x => (
            <button key={x.i} type="button" aria-label={sentence(x)} className="h-full min-w-1 cursor-pointer border-0 p-0 outline-offset-2 transition-opacity"
              style={{ flexGrow: x.n, flexBasis: 0, background: BAND_FILLS[x.i], opacity: faded(x.i) ? 0.35 : 1 }}
              onMouseEnter={() => setActive(x.i)} onFocus={() => setActive(x.i)} onBlur={() => setActive(null)}
              onClick={() => setActive(a => (a === x.i ? null : x.i))} />
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-primary)]">
          {shown.map(x => (
            <li key={x.i} data-active={active === x.i ? 'true' : undefined}
              tabIndex={0} aria-label={sentence(x)}
              className="-mx-1.5 flex cursor-pointer select-none items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-0.5 outline-offset-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              style={active === x.i ? { background: 'var(--bg-btn-hover)' } : undefined}
              onMouseEnter={() => setActive(x.i)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(x.i)} onBlur={() => setActive(null)} onClick={() => setActive(a => (a === x.i ? null : x.i))}>
              <LegendItem color={BAND_FILLS[x.i]}><span><span className="font-black">{x.n}</span> {BAND_SHORT[x.i]}{x.i === unitBand ? ' min' : ''}</span></LegendItem>
            </li>
          ))}
        </ul>
        {mapHref && <ArrowLink href={allRoutesMapHref(mapHref)} className="sm:ml-auto">See these routes on the map</ArrowLink>}
      </div>
    </div>
  );
}

/** A route's name cell in a routes table: the same cleaned names the map's lists show (bold part, then the lighter name). */
export function RouteNameCell({ shortName, longName, mode, agencyName }: { shortName: string; longName?: string | null; mode: number; agencyName: string }) {
  const label = routeLabels({ shortName, longName: longName ?? null, mode, agencyName });
  return <><span className="font-black">{label.primary}</span>{label.secondary ? <span className="text-[var(--text-muted)]"> {label.secondary}</span> : null}</>;
}
