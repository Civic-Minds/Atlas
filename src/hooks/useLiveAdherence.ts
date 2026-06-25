import { useEffect, useState } from 'react';

export interface StopAdherence {
  agency: string;
  stopId: string;
  avgGap: number | null;
  scheduledHeadwayMin: number | null;
  headwayDeltaMin: number | null;
}

export interface TripDrift {
  agency: string;
  tripId: string;
  directionId: number;
  entryDelayMin: number;
  exitDelayMin: number;
  avgDelayMin: number;
  driftMin: number;
}

export interface LiveAdherenceData {
  timestamp: string;
  arrivals: StopAdherence[];
  trips: TripDrift[];
}

export type LiveStatus = 'pending' | 'noData' | 'live';

/** Fetch live GTFS-RT adherence on demand when a covered route is selected. */
export function useLiveAdherence(
  agencySlug: string | null,
  routeShortName: string | null,
  pollIntervalMs = 60_000,
): { data: LiveAdherenceData | null; status: LiveStatus } {
  const [data, setData] = useState<LiveAdherenceData | null>(null);
  const [status, setStatus] = useState<LiveStatus>('pending');

  useEffect(() => {
    if (!agencySlug || !routeShortName) {
      setData(null);
      setStatus('pending');
      return;
    }

    let cancelled = false;
    const slug = agencySlug;
    const route = routeShortName;
    // Don't clear data — keep previous visible while new route loads
    setStatus('pending');

    async function poll() {
      try {
        const res = await fetch(
          `/api/live-adherence?agency=${encodeURIComponent(slug)}&route=${encodeURIComponent(route)}`,
        );
        if (!res.ok) { if (!cancelled) setStatus('noData'); return; }
        const json = await res.json();
        if (cancelled) return;
        if (json && !json.noData && !json.error) {
          setData(json);
          setStatus('live');
        } else {
          setData(null);
          setStatus('noData');
        }
      } catch {
        if (!cancelled) setStatus('noData');
      }
    }

    poll();
    const id = setInterval(poll, pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [agencySlug, routeShortName, pollIntervalMs]);

  return { data, status };
}

export function agencyHeadwayDelta(data: LiveAdherenceData | null, agency: string): number | null {
  if (!data) return null;
  const stops = data.arrivals.filter(a => a.agency === agency && a.headwayDeltaMin != null);
  if (stops.length === 0) return null;
  const avg = stops.reduce((sum, s) => sum + (s.headwayDeltaMin ?? 0), 0) / stops.length;
  return Math.round(avg * 10) / 10;
}

export interface TripSummary {
  total: number;
  onTime: number;
  early: number;
  late: number;
  avgDelayMin: number;
}

export function agencyTripSummary(data: LiveAdherenceData | null, agency: string): TripSummary | null {
  if (!data) return null;
  const trips = data.trips.filter(t => t.agency === agency);
  if (trips.length === 0) return null;
  let onTime = 0, early = 0, late = 0;
  for (const t of trips) {
    if (t.avgDelayMin > 1) late++;
    else if (t.avgDelayMin < -1) early++;
    else onTime++;
  }
  const avgDelayMin = Math.round(trips.reduce((s, t) => s + t.avgDelayMin, 0) / trips.length * 10) / 10;
  return { total: trips.length, onTime, early, late, avgDelayMin };
}
