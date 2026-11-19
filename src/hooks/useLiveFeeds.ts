import { useCallback, useEffect, useRef, useState } from 'react';
import type { LiveVehicle } from '../context/LiveVehiclesMapOverlay';
import { liveVehiclesEqual } from '../utils/liveVehiclesFingerprint';
import { LIVE_POLL_SEC } from '../../shared/rules/live';

export const POLL_INTERVAL_MS = LIVE_POLL_SEC * 1000;

/** The entries of a per-agency record for the agencies in `keep`; the same object when nothing goes. */
export function keepSlugs<T>(prev: Record<string, T>, keep: ReadonlySet<string>): Record<string, T> {
  const gone = Object.keys(prev).filter(s => !keep.has(s));
  if (gone.length === 0) return prev;
  const next: Record<string, T> = {};
  for (const [s, v] of Object.entries(prev)) if (keep.has(s)) next[s] = v;
  return next;
}

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
  // CIV-1768: when the next poll runs (epoch ms), for the "Retrying in 12s" countdown. Null while not polling.
  const [nextPollAt, setNextPollAt] = useState<number | null>(null);
  // #1568: the agencies in view now. A reply for an agency that has left the view is dropped, so
  // it can't put back an error (or vehicles) the view no longer has.
  const inView = useRef<ReadonlySet<string>>(new Set());

  const fetchForSlug = useCallback(async (slug: string) => {
    try {
      const res = await fetch(`/api/live-vehicles?agency=${slug}`);
      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error || "Can’t reach this feed right now.");
      }
      const data = (await res.json()) as { vehicles?: any[]; headways?: Record<string, { gapMin: number; samples: number }>; degraded?: boolean; degradedReason?: string };
      if (!inView.current.has(slug)) return;
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
      if (!inView.current.has(slug)) return;
      setErrorBySlug(prev => ({ ...prev, [slug]: err.message || 'Feed unavailable' }));
      setFailCountBySlug(prev => ({ ...prev, [slug]: (prev[slug] ?? 0) + 1 }));
    }
  }, []);

  // Start/stop polling when visible slugs change
  useEffect(() => {
    inView.current = new Set(active ? visibleSlugs : []);
    if (!active || visibleSlugs.length === 0) {
      setVehiclesBySlug({});
      setHeadwaysBySlug({});
      setLoadingBySlug({});
      setErrorBySlug({});
      setFailCountBySlug({});
      setDegradedBySlug({});
      setNextPollAt(null);
      return;
    }

    // #1568: an agency that left the view drops out of every per-agency record, its error and
    // failure count too, so the "can't be shown" notice names only agencies in view (it had named
    // York Region Transit after the map moved away from it).
    const keep = inView.current;
    setVehiclesBySlug(prev => keepSlugs(prev, keep));
    setHeadwaysBySlug(prev => keepSlugs(prev, keep));
    setErrorBySlug(prev => keepSlugs(prev, keep));
    setFailCountBySlug(prev => keepSlugs(prev, keep));
    setDegradedBySlug(prev => keepSlugs(prev, keep));

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

    setNextPollAt(Date.now() + POLL_INTERVAL_MS);
    const pollId = setInterval(() => {
      setNextPollAt(Date.now() + POLL_INTERVAL_MS);
      visibleSlugs.forEach(fetchForSlug);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(pollId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, visibleSlugKey, fetchForSlug]);

  return { vehiclesBySlug, headwaysBySlug, loadingBySlug, errorBySlug, failCountBySlug, degradedBySlug, nextPollAt };
}
