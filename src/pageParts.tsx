import { FREQUENCY_BANDS, NO_MIDDAY_SHORT, allRoutesMapHref, noMiddayBarSentence } from '../shared/agencyPages';
import ArrowLink from './components/ui/ArrowLink';
import { useHeadwayTiers } from './hooks/useHeadwayTiers';
import SplitBar from './components/charts/SplitBar';
import { plural } from '../shared/overflowText';
import { routeLabels } from './utils/format';

const BAND_PHRASES = FREQUENCY_BANDS.map(b => b.phrase);
const BAND_SHORT = [...FREQUENCY_BANDS.map(b => b.short), NO_MIDDAY_SHORT];
/** The map's own frequency colours (same bands and edges as the filters, in the colour-vision palette), then the neutral no-service grey. */
const NO_SERVICE_FILL = 'var(--control-inactive-bg)';

/**
 * One flat stacked bar of route counts per weekday-midday frequency band. The legend is one short wrapping line.
 * Hovering, focusing or tapping a segment highlights its legend item and fades the other segments; hovering,
 * focusing or tapping a legend item does the same in reverse (both use the pointer cursor). Each segment keeps its aria-label (count and band).
 */
export function FrequencyBar({ counts, mapHref }: { counts: number[]; /** The page's map link: the one link under the bar opens the map with these routes (Weekday midday). The bar itself is not clickable. */ mapHref?: string }) {
  const BAND_FILLS = [...useHeadwayTiers().map(t => t.color), NO_SERVICE_FILL];
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const shown = counts.map((n, i) => ({ n, i })).filter(x => x.n > 0);
  // The unit goes on the first visible frequency band (not on "no midday"), so the row never reads "3 31–60" bare.
  const unitBand = shown.find(x => x.i < BAND_SHORT.length - 1)?.i;
  return (
    <SplitBar
      label="Routes by weekday midday frequency"
      segments={counts.map((n, i) => ({
        key: i,
        value: n,
        fill: BAND_FILLS[i],
        sentence: i < BAND_PHRASES.length ? `${n} ${plural(n, 'route')} ${BAND_PHRASES[i]}` : noMiddayBarSentence(n),
        legend: <span><span className="font-black">{n}</span> {BAND_SHORT[i]}{i === unitBand ? ' min' : ''}</span>,
      }))}
      trailing={mapHref && <ArrowLink href={allRoutesMapHref(mapHref)} className="sm:ml-auto">See these routes on the map</ArrowLink>}
    />
  );
}

/** A route's name cell in a routes table: the same cleaned names the map's lists show (bold part, then the lighter name). */
export function RouteNameCell({ shortName, feedShortName, longName, mode, agencyName }: {
  shortName: string;
  /** CIV-984: the feed's own short name ('' when it has none). Given, it labels the route as every other surface does. */
  feedShortName?: string;
  longName?: string | null;
  mode: number;
  agencyName: string;
}) {
  // A route with neither a short nor a long name is named by its route ID (the page data's name).
  if (feedShortName !== undefined && (feedShortName || longName)) {
    const label = routeLabels({ shortName: feedShortName, longName: longName ?? null, mode, agencyName });
    return <><span className="font-black">{label.primary}</span>{label.secondary ? <span className="text-[var(--text-muted)]"> {label.secondary}</span> : null}</>;
  }
  const named = routeLabels({ shortName, longName: longName ?? null, mode, agencyName });
  // The page data names a route with no short name by its long name, so the two match. Where that makes the long name show
  // twice (#1122: Orillia "West Ridge Via Coldwater Road  West Ridge"), label it as having no short name. A feed that
  // really gives both the same name ("CMAX", "USI") has no second part, so it keeps its label.
  const label = shortName === longName && named.secondary ? routeLabels({ shortName: '', longName, mode, agencyName }) : named;
  return <><span className="font-black">{label.primary}</span>{label.secondary ? <span className="text-[var(--text-muted)]"> {label.secondary}</span> : null}</>;
}
