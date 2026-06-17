import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import {
  LIVE_POLLING_CONFIG,
  matchesLiveRouteId,
  resolvePatternKey,
  scheduleOffsetForPattern,
} from '../../shared/livePollingConfig.js';

const cfg = LIVE_POLLING_CONFIG.hamilton;
const TARGET_STOPS = cfg.targetStops;
const POLL_INTERVAL_MS = 30_000;
const RUN_MINUTES = 30;

const lastStop = new Map<string, string>();
const arrivals = new Map<string, number[]>();
const vehicleProgress = new Map<string, { stopId: string; ts: number; directionId: string }>();
const vehicleLongPattern = new Map<string, boolean>();

async function poll() {
  const res = await fetch(cfg.vehiclePositionsUrl);
  const buf = Buffer.from(await res.arrayBuffer());
  const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buf);

  for (const e of feed.entity) {
    const vp = e.vehicle;
    const routeId = vp?.trip?.routeId;
    if (!vp || !matchesLiveRouteId('hamilton', routeId)) continue;
    const stopId = vp.stopId;
    const vehicleId = vp.vehicle?.id;
    if (!stopId || !vehicleId || !(stopId in TARGET_STOPS)) continue;
    if (vp.currentStatus !== 1 && vp.currentStatus !== 2) continue;
    if (lastStop.get(vehicleId) === stopId) continue;

    lastStop.set(vehicleId, stopId);
    const ts = Number(vp.timestamp) * 1000;

    if (cfg.longPatternStops?.includes(stopId)) {
      vehicleLongPattern.set(vehicleId, true);
    }
    const onLong = vehicleLongPattern.get(vehicleId) ?? false;
    const patternKey = resolvePatternKey(cfg, vp.trip?.directionId, stopId, onLong);

    const list = arrivals.get(stopId) ?? [];
    list.push(ts);
    arrivals.set(stopId, list);

    const gapMin = list.length > 1 ? (ts - list[list.length - 2]) / 60_000 : null;
    let line = `[${new Date(ts).toISOString()}] vehicle ${vehicleId} at ${TARGET_STOPS[stopId]}` +
      (gapMin != null ? ` — gap since previous bus: ${gapMin.toFixed(1)} min (scheduled ${cfg.scheduledHeadwayMin} min)` : ' — first bus seen');

    const prev = vehicleProgress.get(vehicleId);
    if (prev && prev.directionId === patternKey) {
      const template = scheduleOffsetForPattern(cfg, patternKey);
      const scheduledSeg = template?.[stopId] - template?.[prev.stopId];
      if (scheduledSeg != null && !Number.isNaN(scheduledSeg)) {
        const actualSeg = (ts - prev.ts) / 60_000;
        const drift = actualSeg - scheduledSeg;
        line += ` | since ${TARGET_STOPS[prev.stopId]}: ${actualSeg.toFixed(1)} min actual vs ${scheduledSeg.toFixed(1)} min scheduled (${drift >= 0 ? '+' : ''}${drift.toFixed(1)} min drift)`;
      }
    }
    vehicleProgress.set(vehicleId, { stopId, ts, directionId: patternKey });

    console.log(line);
  }
}

async function main() {
  console.log(`Polling HSR Route 1 (route_id=${cfg.routeIds.join(', ')}) every ${POLL_INTERVAL_MS / 1000}s for ${RUN_MINUTES} min...`);
  const end = Date.now() + RUN_MINUTES * 60_000;
  while (Date.now() < end) {
    try {
      await poll();
    } catch (err) {
      console.error('poll error:', err);
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }

  console.log('\n=== Summary ===');
  for (const [stopId, list] of arrivals) {
    console.log(`\n${TARGET_STOPS[stopId]}: ${list.length} buses observed`);
    for (let i = 1; i < list.length; i++) {
      const gap = (list[i] - list[i - 1]) / 60_000;
      console.log(`  gap ${i}: ${gap.toFixed(1)} min (scheduled ${cfg.scheduledHeadwayMin} min, diff ${(gap - cfg.scheduledHeadwayMin).toFixed(1)})`);
    }
  }
}

main();
