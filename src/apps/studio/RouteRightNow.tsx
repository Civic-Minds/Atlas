import { useCallback, useMemo, useRef, useState } from 'react';
import LiveRoutePerformance from '../../components/Live/LiveRoutePerformance';
import { RouteCardRows } from '../../components/Interval/panels/RouteCardHeadway';
import { CardDirectionRow, CardHelpNotice, SidebarCardList, type CardReportButtonHandle } from '../../components/Interval/cardUi';
import { useAgencies } from '../../hooks/useAgencies';
import { useLiveFeeds } from '../../hooks/useLiveFeeds';
import { useAgencyGeo } from '../../hooks/useAgencyGeo';
import { useLiveTripDirections } from '../../hooks/useLiveTripDirections';
import { resolveLiveVehicles } from '../../utils/liveResolveVehicles';
import { LIVE_SHARED_GAP_KEY, STUDIO_ROUTE_PANEL_PENDING, type LiveRowGap } from '../../../shared/liveWording';
import { sameLiveRowGap } from '../../utils/liveRowValue';
import { liveCardModelNow, liveCardRowKeys, liveScheduledRowsNow } from '../../utils/liveScheduledHeadway';
import { groupVehiclesByDirection, rowlessGroupShown, mergeIntoCardRows, routeDirectionLabels, rowDirectionKey } from '../../utils/liveGrouping';
import { streetJoin } from '../../utils/stopLabel';
import { formatBranchLabel, vehicleModeWord } from '../../utils/format';
import { effectiveMode, type EffectiveModeInput } from '../../../shared/modes';
import { directionSummary } from '../LiveVehicles';
import type { ShapeProperties } from '../../hooks/useIntervalStats';
import type { LiveVehicle } from '../../context/LiveVehiclesMapOverlay';

/**
 * CIV-2021, CIV-3047 (Ryan, 2026-11-27: "Then this should use a similar/same design for that part", "Using the same code
 * perhaps"): Studio's Live route panel draws the main map card's own row list (RouteCardRows) for the route now, every
 * direction, each destination once with its live vehicles and gaps, as main Live's card does. Live's "Right now" reading
 * runs behind it only to hand each destination its gaps. Studio's week figures stay below it.
 */
export default function RouteRightNow({ slug, routeShortName }: { slug: string; routeShortName: string; /** Not used: every direction shows, as on the map's card (#1921). */ direction?: number | null }) {
  const { agencies } = useAgencies();
  const { vehiclesBySlug, degradedBySlug, errorBySlug } = useLiveFeeds(true, [slug], slug);
  const polled = useMemo(() => (vehiclesBySlug[slug] ?? []).filter(v => v.routeShortName === routeShortName), [vehiclesBySlug, slug, routeShortName]);
  const geo = useAgencyGeo(slug);
  // CIV-3159 (same route, different gaps on the map and here): the vehicles read as the map's card reads them, one
  // resolver for both (resolveLiveVehicles), with the trips' own directions winning over the shape guess.
  const guessed = useMemo(() => resolveLiveVehicles(polled, geo), [polled, geo]);
  const trips = useLiveTripDirections(slug, routeShortName, guessed, true);
  const vehicles = useMemo(() => resolveLiveVehicles(polled, geo, trips.byVehicle), [polled, geo, trips.byVehicle]);
  const reportRef = useRef<CardReportButtonHandle>(null);
  const model = useMemo(() => liveCardModelNow(geo, agencies, slug, routeShortName), [geo, agencies, slug, routeShortName]);
  const routeFeature = useMemo(() => geo?.features.find(x => (x.properties as ShapeProperties | null)?.routeShortName === routeShortName), [geo, routeShortName]);
  const routeLongName = (routeFeature?.properties as ShapeProperties | null | undefined)?.routeLongName ?? '';
  const modeWord = useMemo(() => {
    const f = routeFeature;
    const props = f?.properties as EffectiveModeInput | null | undefined;
    return vehicleModeWord(props?.routeType == null ? null : effectiveMode({ ...props, agencySlug: slug }));
  }, [routeFeature, slug]);
  // The same grouping as main Live: by destination, then under the card's own rows (mergeIntoCardRows, #1877).
  const rowKeys = useMemo(() => liveCardRowKeys(model, routeShortName), [model, routeShortName]);
  const groups = useMemo(() => {
    const labels = geo ? new Map([...routeDirectionLabels(geo.features, routeShortName)].map(([d, l]) => [d, streetJoin(l)])) : new Map<number, string>();
    return mergeIntoCardRows(groupVehiclesByDirection(vehicles, labels), rowKeys);
  }, [geo, routeShortName, rowKeys, vehicles]);
  // Each destination's live gaps, handed up by Live's own reading (onDestinationGaps), as on main Live's card.
  const [gaps, setGaps] = useState<ReadonlyMap<number, ReadonlyMap<string, LiveRowGap>>>(new Map());
  const onDestinationGaps = useCallback((directionId: number, g: ReadonlyMap<string, LiveRowGap>) => {
    setGaps(prev => {
      const old = prev.get(directionId);
      if (old && old.size === g.size && [...g].every(([k, t]) => sameLiveRowGap(old.get(k), t))) return prev;
      return new Map(prev).set(directionId, g);
    });
  }, []);
  const scheduledRowsFor = useCallback(
    (directionId: number, label: string) => liveScheduledRowsNow(geo, agencies, slug, routeShortName, { directionId, label }),
    [geo, agencies, slug, routeShortName],
  );
  const rowLive = (feature: ShapeProperties) => {
    const key = rowDirectionKey(feature.headsign, routeShortName);
    const vs = key ? groups.get(key) : undefined;
    if (!key || !vs?.length) return null;
    const gap = [...gaps.values()].map(g => g.get(key)).find(t => t != null);
    return { key, subLabel: directionSummary(vs, modeWord), gap };
  };
  const feedDown = !!degradedBySlug[slug] || !!errorBySlug[slug];
  const reading = (
    <LiveRoutePerformance
      key={`${slug}::${routeShortName}`}
      slug={slug}
      routeShortName={routeShortName}
      vehicles={vehicles}
      feedDegraded={feedDown}
      scheduledRowsFor={scheduledRowsFor}
      // With the card's rows to carry them, the reading only hands up each destination's gaps; while the route's shapes
      // load, it draws its own rows.
      onDestinationGaps={model ? onDestinationGaps : undefined}
      rowVehicles={groups}
      unavailableMessage={STUDIO_ROUTE_PANEL_PENDING.noReading}
      liveEnabled
    />
  );
  if (!model) return reading;
  if (vehicles.length === 0) return <CardHelpNotice message={STUDIO_ROUTE_PANEL_PENDING.noReading} />;
  return (
    <>
      {reading}
      {/* The map card's own list spacing around its direction headings. */}
      <SidebarCardList><RouteCardRows model={model} reportRef={reportRef} rowLive={rowLive} sharedLive={dirId => gaps.get(dirId)?.get(LIVE_SHARED_GAP_KEY)} /></SidebarCardList>
      <Unclaimed groups={groups} rowKeys={new Set(rowKeys.map(r => r.key))} modeWord={modeWord} routeShortName={routeShortName} routeLongName={routeLongName} />
    </>
  );
}

/**
 * CIV-3169 (#1937): the destinations none of the card's rows carries (overnight, before the card has rows for the hour), one
 * row each named by its destination, as main Live's card lists them (LiveVehicles' directionExtra). Vehicles with no
 * destination make no row: there is no placeholder ("No destination") row.
 */
export function unclaimedGroups(groups: ReadonlyMap<string, LiveVehicle[]>, rowKeys: ReadonlySet<string>): [string, LiveVehicle[]][] {
  return [...groups].filter(([k, vs]) => vs.length > 0 && rowlessGroupShown(k) && !rowKeys.has(k));
}

function Unclaimed({ groups, rowKeys, modeWord, routeShortName, routeLongName }: { groups: ReadonlyMap<string, LiveVehicle[]>; rowKeys: ReadonlySet<string>; modeWord: string; routeShortName: string; routeLongName: string }) {
  return <>{unclaimedGroups(groups, rowKeys).map(([key, vs]) => (
    <CardDirectionRow key={`live:${key}`} labelWeight="regular" label={formatBranchLabel(key, routeShortName, routeLongName)} labelEnd={directionSummary(vs, modeWord)} />
  ))}</>;
}
