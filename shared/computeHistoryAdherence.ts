import { getLiveRouteConfig, LIVE_AGENCY_TIMEZONES } from './livePollingConfig.js';

function localHour(unixTs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(new Date(unixTs * 1000));
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
  return hour === 24 ? 0 : hour;
}

/** One snapshot file from atlas-live/{slug}/{date}/{ts}.json */
export interface SnapshotTrip {
  id: string;
  r: string;  // route_id
  d: number;  // direction_id
  delay: number | null;
}

export interface Snapshot {
  ts: number;
  trips: SnapshotTrip[];
}

export interface HourBucket {
  hour: number; // 0–23
  avgDelayMin: number;
  sampleCount: number;
}

export interface HistoryAdherenceResult {
  agency: string;
  routeShortName: string;
  scheduledHeadwayMin: number;
  days: number;
  byHour: HourBucket[];
  overallAvgDelayMin: number;
  sampleCount: number;
}

export function computeHistoryAdherence(
  agency: string,
  routeShortName: string,
  snapshots: Snapshot[],
  days: number,
  overrideHeadway?: number,
): HistoryAdherenceResult | null {
  const cfg = getLiveRouteConfig(agency, routeShortName);
  if (!cfg) return null;

  const routeIdSet = new Set(cfg.routeIds);
  const timeZone = LIVE_AGENCY_TIMEZONES[agency] ?? 'America/Toronto';

  const hourSamples: Map<number, number[]> = new Map();
  for (let h = 0; h < 24; h++) hourSamples.set(h, []);

  for (const snap of snapshots) {
    const hour = localHour(snap.ts, timeZone);

    for (const trip of snap.trips) {
      if (!routeIdSet.has(trip.r)) continue;
      if (trip.delay === null) continue;
      hourSamples.get(hour)!.push(trip.delay / 60);
    }
  }

  const byHour: HourBucket[] = [];
  let totalDelay = 0;
  let totalSamples = 0;

  for (let h = 0; h < 24; h++) {
    const samples = hourSamples.get(h)!;
    if (samples.length === 0) continue;
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    byHour.push({
      hour: h,
      avgDelayMin: Math.round(avg * 10) / 10,
      sampleCount: samples.length,
    });
    totalDelay += avg * samples.length;
    totalSamples += samples.length;
  }

  const scheduledHeadway = overrideHeadway ?? cfg.scheduledHeadwayMin;

  return {
    agency,
    routeShortName,
    scheduledHeadwayMin: scheduledHeadway,
    days,
    byHour,
    overallAvgDelayMin: totalSamples > 0 ? Math.round(totalDelay / totalSamples * 10) / 10 : 0,
    sampleCount: totalSamples,
  };
}
