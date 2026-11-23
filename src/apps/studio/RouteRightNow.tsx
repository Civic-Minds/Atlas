import { useMemo, useState } from 'react';
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
export default function RouteRightNow({ slug, routeShortName, direction }: { slug: string; routeShortName: string; direction: number | null }) {
  const { agencies } = useAgencies();
  const { vehiclesBySlug, degradedBySlug, errorBySlug } = useLiveFeeds(true, [slug], slug);
  const vehicles = useMemo(() => (vehiclesBySlug[slug] ?? []).filter(v => v.routeShortName === routeShortName), [vehiclesBySlug, slug, routeShortName]);
  // The agency's route shapes, for the card's Scheduled lines (useAgencyGeo: the map's copy when it has one).
  const geo = useAgencyGeo(slug);
  const [counted, setCounted] = useState<{ directionId: number; label: string } | null>(null);
  const countedDir = counted?.directionId ?? null, countedLabel = counted?.label ?? null;
  const scheduledRows = useMemo(
    () => liveScheduledRowsNow(geo, agencies, slug, routeShortName, countedDir == null || countedLabel == null ? null : { directionId: countedDir, label: countedLabel }),
    [geo, agencies, slug, routeShortName, countedDir, countedLabel],
  );
  return (
    <LiveRoutePerformance
      key={`${slug}::${routeShortName}`}
      slug={slug}
      routeShortName={routeShortName}
      vehicles={vehicles}
      feedDegraded={!!degradedBySlug[slug] || !!errorBySlug[slug]}
      onCounted={setCounted}
      scheduledRows={scheduledRows}
      direction={direction}
      unavailableMessage={STUDIO_ROUTE_PANEL_PENDING.noReading}
      liveEnabled
    />
  );
}
