import GtfsRealtimeBindings from 'gtfs-realtime-bindings';

const FEED_URL = 'https://opendata.hamilton.ca/GTFS-RT/GTFS_VehiclePositions.pb';
const ROUTE_ID = '5677'; // HSR Route 1 (King) — live feed and static schedule agree on this id
const SCHEDULED_HEADWAY_MIN = 12; // weekday midday, from static stop_times.txt at Hamilton GO Centre (355415)
const TARGET_STOPS: Record<string, string> = {
  '1403': 'Eastgate Terminal',
  '355415': 'Hamilton GO Centre',
  '1790': 'John at Jackson (dir 0)',
  '1771': 'James at Jackson (dir 1)',
  '2138': 'Main at Emerson (1A only)',
};
const POLL_INTERVAL_MS = 30_000;
const RUN_MINUTES = 30;

// Route 5677 covers two distinct sub-patterns sharing one route_id:
// the regular short-turn (Eastgate <-> Hamilton GO Centre) and the
// "1A" long run (Eastgate <-> West Hamilton via McMaster). direction_id
// alone doesn't separate them reliably (a 1A trip was observed live with
// directionId 0 despite static schedule marking it direction 1), so we
// key off trip_id set membership instead.
const ONE_A_TRIP_IDS = new Set([
  '2155559','2155561','2155563','2155565','2155567','2155569','2155571','2155573',
  '2155575','2155577','2155579','2155581','2155583','2155585','2155587','2155589',
  '2155591','2155593','2155595','2155597','2155599','2155601','2155603','2155605',
  '2155607','2155609','2155611','2155613','2155615','2155617','2155619','2155621',
  '2155623','2155625','2155627','2155629','2155631','2155633','2155635','2155637',
  '2155639','2155641','2155643','2155645','2155647','2155649','2155651','2155653',
  '2155655','2155657','2155659','2155661','2155663','2155665','2155667','2155669',
]);

// Scheduled minutes-from-trip-start at each target stop, per direction.
// Hamilton's static GTFS matches the live feed's route_id (no version-prefix
// mismatch like Burlington), built from an actual weekday King St trip.
const SCHEDULE_OFFSET_MIN: Record<string, Record<string, number>> = {
  '0': { '355415': 0, '1790': 2, '1403': 32 },
  '1': { '1403': 0, '1771': 27.7, '355415': 30 },
};

// 1A-only template, keyed by trip_id membership rather than direction_id
// (trip 2155669, dir 1 in static, 74 stops, Eastgate -> Main/Emerson).
const SCHEDULE_OFFSET_1A: Record<string, number> = { '1403': 0, '2138': 45 };

const lastStop = new Map<string, string>();
const arrivals = new Map<string, number[]>();
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
    const tripId = vp.trip?.tripId;
    if (!stopId || !vehicleId || !(stopId in TARGET_STOPS)) continue;
    if (vp.currentStatus !== 1 && vp.currentStatus !== 2) continue;
    if (lastStop.get(vehicleId) === stopId) continue;

    lastStop.set(vehicleId, stopId);
    const ts = Number(vp.timestamp) * 1000;
    const isOneA = !!tripId && ONE_A_TRIP_IDS.has(tripId);
    const directionId = isOneA ? '1A' : String(vp.trip?.directionId ?? '0');
    const list = arrivals.get(stopId) ?? [];
    list.push(ts);
    arrivals.set(stopId, list);

    const gapMin = list.length > 1 ? (ts - list[list.length - 2]) / 60_000 : null;
    let line = `[${new Date(ts).toISOString()}] vehicle ${vehicleId} at ${TARGET_STOPS[stopId]}` +
      (gapMin != null ? ` — gap since previous bus: ${gapMin.toFixed(1)} min (scheduled ${SCHEDULED_HEADWAY_MIN} min)` : ' — first bus seen');

    const prev = vehicleProgress.get(vehicleId);
    if (prev && prev.directionId === directionId) {
      const template = directionId === '1A' ? SCHEDULE_OFFSET_1A : SCHEDULE_OFFSET_MIN[directionId];
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
  console.log(`Polling HSR Route 1 (route_id=${ROUTE_ID}) every ${POLL_INTERVAL_MS / 1000}s for ${RUN_MINUTES} min...`);
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
