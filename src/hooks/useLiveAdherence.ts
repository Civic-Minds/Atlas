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

export function useLiveAdherence(pollIntervalMs = 60_000) {
  const [data, setData] = useState<LiveAdherenceData | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch('/api/live-status');
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json && !json.noData && !json.error) setData(json);
      } catch {}
    }

    poll();
    const id = setInterval(poll, pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pollIntervalMs]);

  return data;
}

export function agencyHeadwayDelta(data: LiveAdherenceData | null, agency: string): number | null {
  if (!data) return null;
  const stops = data.arrivals.filter(a => a.agency === agency && a.headwayDeltaMin != null);
  if (stops.length === 0) return null;
  const avg = stops.reduce((sum, s) => sum + (s.headwayDeltaMin ?? 0), 0) / stops.length;
  return Math.round(avg * 10) / 10;
}
