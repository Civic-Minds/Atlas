import { useEffect, useMemo, useState } from 'react';
import LiveRoutePerformance from '../../components/Live/LiveRoutePerformance';
import { useAgencies } from '../../hooks/useAgencies';
import { useLiveFeeds } from '../../hooks/useLiveFeeds';
import { fetchAgencyGeo, getCachedAgencyGeo } from '../../lib/agencyGeo';
import { STUDIO_ROUTE_PANEL_PENDING } from '../../../shared/liveWording';
import { liveScheduledRowsNow } from '../../utils/liveScheduledHeadway';

const GEO_TRIES = 5;
const GEO_RETRY_MS = 15_000;

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
  // The agency's route shapes, for the card's Scheduled lines: the map's copy when it has one.
  const [layer, setLayer] = useState<{ slug: string; fc: GeoJSON.FeatureCollection } | null>(() => {
    const fc = getCachedAgencyGeo(slug);
    return fc ? { slug, fc } : null;
  });
  // A load that fails (a big agency timing out while the map loads it too) is tried again, as the map retries its own.
  const [tries, setTries] = useState(0);
  useEffect(() => {
    const agency = agencies.find(a => a.slug === slug);
    if (!agency || layer?.slug === slug) return;
    let live = true;
    let retry: number | undefined;
    fetchAgencyGeo({ slug: agency.slug, name: agency.name, url: agency.url ?? '', betaOnly: agency.betaOnly })
      .then(fc => { if (live) setLayer({ slug, fc }); })
      .catch(() => { if (live && tries < GEO_TRIES) retry = window.setTimeout(() => setTries(t => t + 1), GEO_RETRY_MS); });
    return () => { live = false; window.clearTimeout(retry); };
  }, [slug, agencies, layer?.slug, tries]);
  const [counted, setCounted] = useState<{ directionId: number; label: string } | null>(null);
  const countedDir = counted?.directionId ?? null, countedLabel = counted?.label ?? null;
  const scheduledRows = useMemo(
    () => liveScheduledRowsNow(layer?.slug === slug ? layer.fc : undefined, agencies, slug, routeShortName, countedDir == null || countedLabel == null ? null : { directionId: countedDir, label: countedLabel }),
    [layer, agencies, slug, routeShortName, countedDir, countedLabel],
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
    />
  );
}
