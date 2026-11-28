import { useCallback, useMemo } from 'react';
import LiveRoutePerformance from '../../components/Live/LiveRoutePerformance';
import { useAgencies } from '../../hooks/useAgencies';
import { useLiveFeeds } from '../../hooks/useLiveFeeds';
import { useAgencyGeo } from '../../hooks/useAgencyGeo';
import { STUDIO_ROUTE_PANEL_PENDING } from '../../../shared/liveWording';
import { liveScheduledRowsNow } from '../../utils/liveScheduledHeadway';

/**
 * CIV-2021 (Ryan: the right-now card shared between main Live and Studio): Studio's Live route panel shows main Live's own
 * route card (LiveRoutePerformance) over the same live vehicles, polled here as the map polls them, with the same Scheduled
 * lines (liveScheduledRowsNow) and the same per-branch vehicles and gaps (CIV-2047). Studio's week figures stay below it.
 * The panel's Direction chip picks the card's direction.
 */
export default function RouteRightNow({ slug, routeShortName }: { slug: string; routeShortName: string; /** Not used: the card shows every direction, as the map's does (#1921). */ direction?: number | null }) {
  const { agencies } = useAgencies();
  const { vehiclesBySlug, degradedBySlug, errorBySlug } = useLiveFeeds(true, [slug], slug);
  const vehicles = useMemo(() => (vehiclesBySlug[slug] ?? []).filter(v => v.routeShortName === routeShortName), [vehiclesBySlug, slug, routeShortName]);
  // The agency's route shapes, for the card's Scheduled lines (useAgencyGeo: the map's copy when it has one).
  const geo = useAgencyGeo(slug);
  // #1921 and Ryan, 2026-11-27 ("Then this should use a similar/same design for that part"): every direction, each with
  // the map card's own destination rows, as the main map's Live card shows them.
  const scheduledRowsFor = useCallback(
    (directionId: number, label: string) => liveScheduledRowsNow(geo, agencies, slug, routeShortName, { directionId, label }),
    [geo, agencies, slug, routeShortName],
  );
  return (
    <LiveRoutePerformance
      key={`${slug}::${routeShortName}`}
      slug={slug}
      routeShortName={routeShortName}
      vehicles={vehicles}
      feedDegraded={!!degradedBySlug[slug] || !!errorBySlug[slug]}
      scheduledRowsFor={scheduledRowsFor}
      unavailableMessage={STUDIO_ROUTE_PANEL_PENDING.noReading}
      liveEnabled
    />
  );
}
