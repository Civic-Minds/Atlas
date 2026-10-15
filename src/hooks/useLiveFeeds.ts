import { useCallback, useEffect, useState } from 'react';
import type { LiveVehicle } from '../context/LiveVehiclesMapOverlay';
import { liveVehiclesEqual } from '../utils/liveVehiclesFingerprint';

const POLL_INTERVAL_MS = 15_000;

/**
 * Polls the live vehicle feed for every agency in view, every 15 s while Live is open,
 * and keeps per-agency vehicles, observed headways, loading, errors and feed health.
 */
export function useLiveFeeds(active: boolean, visibleSlugs: string[], visibleSlugKey: string) {
  // Per-agency vehicle state
  const [vehiclesBySlug, setVehiclesBySlug] = useState<Record<string, LiveVehicle[]>>({});
  // Observed headways from the API: slug → routeShortName → { gapMin, samples }
  const [headwaysBySlug, setHeadwaysBySlug] = useState<Record<string, Record<string, { gapMin: number; samples: number }>>>({});
  const [loadingBySlug, setLoadingBySlug] = useState<Record<string, boolean>>({});
  const [errorBySlug, setErrorBySlug] = useState<Record<string, string | null>>({});
  // Consecutive failures per slug — used to soften "will retry automatically"
  // once a feed has clearly been down for a while, not just a blip.
  const [failCountBySlug, setFailCountBySlug] = useState<Record<string, number>>({});
  const [degradedBySlug, setDegradedBySlug] = useState<Record<string, string | null>>({});


  const fetchForSlug = useCallback(async (slug: string) => {
    try {
      const res = await fetch(`/api/live-vehicles?agency=${slug}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Can't reach this feed right now.");
      }
      const data = await res.json();
      const tagged: LiveVehicle[] = (data.vehicles || []).map((v: any) => ({ ...v, agencySlug: slug }));
      // Skip React updates when poll returns the same map-relevant vehicle state
      // (avoids full Live + deck rebuild every 15s while buses idle).
      setVehiclesBySlug(prev => {
        const prior = prev[slug];
        if (prior && liveVehiclesEqual(prior, tagged)) return prev;
        return { ...prev, [slug]: tagged };
      });
      setHeadwaysBySlug(prev => ({ ...prev, [slug]: data.headways || {} }));
      setErrorBySlug(prev => (prev[slug] == null ? prev : { ...prev, [slug]: null }));
      setFailCountBySlug(prev => (prev[slug] ? { ...prev, [slug]: 0 } : prev));
      const degradedMsg = data.degraded ? (data.degradedReason ?? 'Some data unavailable') : null;
      setDegradedBySlug(prev => (prev[slug] === degradedMsg ? prev : { ...prev, [slug]: degradedMsg }));
    } catch (err: any) {
      setErrorBySlug(prev => ({ ...prev, [slug]: err.message || 'Feed unavailable' }));
      setFailCountBySlug(prev => ({ ...prev, [slug]: (prev[slug] ?? 0) + 1 }));
    }
  }, []);

  // Start/stop polling when visible slugs change
  useEffect(() => {
    if (!active || visibleSlugs.length === 0) {
      setVehiclesBySlug({});
      setHeadwaysBySlug({});
      setLoadingBySlug({});
      setErrorBySlug({});
      setFailCountBySlug({});
      setDegradedBySlug({});
      return;
    }

    // Initial fetch
    const loading: Record<string, boolean> = {};
    visibleSlugs.forEach(s => (loading[s] = true));
    setLoadingBySlug(loading);
    Promise.all(visibleSlugs.map(s => fetchForSlug(s))).finally(() =>
      setLoadingBySlug(prev => {
        const next = { ...prev };
        visibleSlugs.forEach(s => (next[s] = false));
        return next;
      })
    );

    const pollId = setInterval(() => visibleSlugs.forEach(fetchForSlug), POLL_INTERVAL_MS);
    return () => {
      clearInterval(pollId);
      // Clear stale data for slugs that left the viewport
      setVehiclesBySlug(prev => {
        const keep = new Set(visibleSlugs);
        const next: typeof prev = {};
        for (const [s, v] of Object.entries(prev)) {
          if (keep.has(s)) next[s] = v;
        }
        return next;
      });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, visibleSlugKey, fetchForSlug]);

  return { vehiclesBySlug, headwaysBySlug, loadingBySlug, errorBySlug, failCountBySlug, degradedBySlug };
}
