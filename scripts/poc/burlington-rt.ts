import GtfsRealtimeBindings from 'gtfs-realtime-bindings';

const FEED_URL = 'https://opendata.burlington.ca/gtfs-rt/GTFS_VehiclePositions.pb';
const ROUTE_ID = '311'; // Route 1, current live schedule's prefix (static zip is already on next period's "351" prefix)
const SCHEDULED_HEADWAY_MIN = 12; // weekday daytime, from static stop_times.txt at stop 679
const TARGET_STOPS: Record<string, string> = {
  '535': 'Appleby GO Station',
  '54': 'Fairview at Brant (eastbound)',
  '52': 'Fairview at Brant (westbound)',
  '722': 'Plains at Waterdown (dir 0)',
  '1073': 'Plains at Waterdown (dir 1)',
  '834': 'York at James',
};
const POLL_INTERVAL_MS = 30_000;
const RUN_MINUTES = 30;

// Scheduled minutes-from-trip-start at each target stop, per direction.
// Derived from the static GTFS's longest weekday trip per direction (stop-to-stop
// travel times should hold across schedule versions even though this route's
// route_id/trip_id prefix changed for the next schedule period).
const SCHEDULE_OFFSET_MIN: Record<string, Record<string, number>> = {
  '0': { '679': 0, '722': 12, '54': 20, '535': 36 },
  '1': { '535': 0, '52': 12, '1073': 20, '834': 34, '679': 41 },
};

// vehicleId -> last seen stopId, to only log on stop change (avoid duplicate logs while parked at a stop)
const lastStop = new Map<string, string>();
// stopId -> array of arrival timestamps (ms)
const arrivals = new Map<string, number[]>();
// vehicleId -> last (stopId, timestamp ms, directionId) seen, to track per-bus drift between stops
const vehicleProgress = new Map<string, { stopId: string; ts: number; directionId: string }>();

async function poll() {
  const res = await fetch(FEED_URL);
  const buf = Buffer.from(await res.arrayBuffer());
  const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buf);

  for (const e of feed.entity) {
    const vp = e.vehicle;
    if (!vp || vp.trip?.routeId !== ROUTE_ID) continue;
    const stopId = vp.stopId;
    const vehicleId = vp.vehicle?.id;
    if (!stopId || !vehicleId || !(stopId in TARGET_STOPS)) continue;
    if (vp.currentStatus !== 1 /* STOPPED_AT */ && vp.currentStatus !== 2 /* IN_TRANSIT_TO, treat as approaching */) continue;
    if (lastStop.get(vehicleId) === stopId) continue; // already logged this stop for this vehicle

    lastStop.set(vehicleId, stopId);
    const ts = Number(vp.timestamp) * 1000;
    const directionId = String(vp.trip?.directionId ?? '0');
    const list = arrivals.get(stopId) ?? [];
    list.push(ts);
    arrivals.set(stopId, list);

    const gapMin = list.length > 1 ? (ts - list[list.length - 2]) / 60_000 : null;
    let line = `[${new Date(ts).toISOString()}] vehicle ${vehicleId} at ${TARGET_STOPS[stopId]}` +
      (gapMin != null ? ` — gap since previous bus: ${gapMin.toFixed(1)} min (scheduled ${SCHEDULED_HEADWAY_MIN} min)` : ' — first bus seen');

    // Per-bus drift: compare actual travel time since this vehicle's last logged
    // target stop (same direction) to the scheduled travel time between those two stops.
    const prev = vehicleProgress.get(vehicleId);
    if (prev && prev.directionId === directionId) {
      const template = SCHEDULE_OFFSET_MIN[directionId];
      const scheduledSeg = template?.[stopId] - template?.[prev.stopId];
      if (scheduledSeg != null && !Number.isNaN(scheduledSeg)) {
        const actualSeg = (ts - prev.ts) / 60_000;
        const drift = actualSeg - scheduledSeg;
        line += ` | since ${TARGET_STOPS[prev.stopId]}: ${actualSeg.toFixed(1)} min actual vs ${scheduledSeg.toFixed(1)} min scheduled (${drift >= 0 ? '+' : ''}${drift.toFixed(1)} min drift)`;
      }
    }
    vehicleProgress.set(vehicleId, { stopId, ts, directionId });

    console.log(line);
  }
}

async function main() {
  console.log(`Polling Route 1 (route_id=${ROUTE_ID}) every ${POLL_INTERVAL_MS / 1000}s for ${RUN_MINUTES} min...`);
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
      console.log(`  gap ${i}: ${gap.toFixed(1)} min (scheduled ${SCHEDULED_HEADWAY_MIN} min, diff ${(gap - SCHEDULED_HEADWAY_MIN).toFixed(1)})`);
    }
  }
}

main();
