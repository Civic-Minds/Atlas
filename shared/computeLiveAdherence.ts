import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import {
  getLiveRouteConfig,
  matchesLiveRouteId,
} from './livePollingConfig.js';

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

export interface LiveAdherenceResult {
  timestamp: string;
  arrivals: StopAdherence[];
  trips: TripDrift[];
}

async function fetchTripUpdates(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
    return GtfsRealtimeBindings.transit_realtime.FeedMessage.toObject(feed, {
      longs: String,
      enums: String,
      bytes: String,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function computeLiveAdherence(
  agency: string,
  routeShortName: string,
): Promise<LiveAdherenceResult | null> {
  const cfg = getLiveRouteConfig(agency, routeShortName);
  if (!cfg) return null;

  const feed = await fetchTripUpdates(cfg.tripUpdatesUrl);
  if (!feed?.entity) return null;

  const timestamp = new Date().toISOString();
  const targetStops = new Set(Object.keys(cfg.targetStops));
  const stopPredictions: Record<string, { predictedTime: number }[]> = {};
  const tripPredictions: Record<string, { stopId: string; scheduledTime: number; delayMin: number; directionId: number }[]> = {};

  for (const entity of feed.entity) {
    const tu = entity.tripUpdate;
    if (!tu?.stopTimeUpdate) continue;
    if (!matchesLiveRouteId(cfg, tu.trip?.routeId)) continue;

    const tripId = tu.trip?.tripId;
    const directionId = tu.trip?.directionId;

    for (const stu of tu.stopTimeUpdate) {
      const stopId = String(stu.stopId);
      if (!targetStops.has(stopId)) continue;

      const arrival = stu.arrival || stu.departure;
      if (!arrival?.time) continue;

      const predictedTime = parseInt(String(arrival.time));
      const delay = arrival.delay ? parseInt(String(arrival.delay)) : 0;
      const scheduledTime = predictedTime - delay;

      if (!stopPredictions[stopId]) stopPredictions[stopId] = [];
      stopPredictions[stopId].push({ predictedTime });

      if (tripId) {
        if (!tripPredictions[tripId]) tripPredictions[tripId] = [];
        tripPredictions[tripId].push({
          stopId,
          scheduledTime,
          delayMin: Math.round(delay / 60 * 10) / 10,
          directionId: Number(directionId ?? 0),
        });
      }
    }
  }

  const scheduledHeadway = cfg.scheduledHeadwayMin;
  const arrivals: StopAdherence[] = [];

  for (const [stopId, predictions] of Object.entries(stopPredictions)) {
    predictions.sort((a, b) => a.predictedTime - b.predictedTime);
    const gaps = [];
    for (let i = 1; i < predictions.length; i++) {
      gaps.push((predictions[i].predictedTime - predictions[i - 1].predictedTime) / 60);
    }
    const avgGap = gaps.length > 0 ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length * 10) / 10 : null;
    const headwayDeltaMin = avgGap != null
      ? Math.round((avgGap - scheduledHeadway) * 10) / 10
      : null;

    arrivals.push({
      agency,
      stopId,
      avgGap,
      scheduledHeadwayMin: scheduledHeadway,
      headwayDeltaMin,
    });
  }

  const trips: TripDrift[] = [];
  for (const [tripId, stops] of Object.entries(tripPredictions)) {
    if (stops.length < 2) continue;
    stops.sort((a, b) => a.scheduledTime - b.scheduledTime);
    const delays = stops.map(s => s.delayMin);
    const entryDelayMin = delays[0];
    const exitDelayMin = delays[delays.length - 1];
    const avgDelayMin = Math.round(delays.reduce((a, b) => a + b, 0) / delays.length * 10) / 10;
    const driftMin = Math.round((exitDelayMin - entryDelayMin) * 10) / 10;

    trips.push({
      agency,
      tripId,
      directionId: stops[0].directionId,
      entryDelayMin,
      exitDelayMin,
      avgDelayMin,
      driftMin,
    });
  }

  return { timestamp, arrivals, trips };
}
