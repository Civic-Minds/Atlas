import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { put } from '@vercel/blob';

export const config = {
  maxDuration: 60,
};

const FEEDS = {
  burlington: 'https://opendata.burlington.ca/gtfs-rt/GTFS_TripUpdates.pb',
  hamilton: 'https://opendata.hamilton.ca/GTFS-RT/GTFS_TripUpdates.pb',
};

const BURLINGTON_ROUTE_ID = '311'; // Route 1
const BURLINGTON_TARGET_STOPS = new Set(['535', '54', '52', '722', '1073', '834', '679']);

const HAMILTON_ROUTE_ID = '5677'; // Route 1 (King)
const HAMILTON_TARGET_STOPS = new Set(['1403', '355415', '1790', '1771', '2138']);

async function fetchFeed(agency: string, url: string) {
  const res = await fetch(url);
  if (!res.ok) return null;
  const buffer = await res.arrayBuffer();
  const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
  return GtfsRealtimeBindings.transit_realtime.FeedMessage.toObject(feed, {
    longs: String,
    enums: String,
    bytes: String,
  });
}

export default async function handler(req: Request) {
  // Service hours: 5am - 12am ET
  const now = new Date();
  const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const timestamp = now.toISOString();
  const hour = etTime.getHours();
  if (hour < 5 && hour >= 0) {
    return new Response('Outside service hours (5am-12am ET)', { status: 200 });
  }

  const snapshots: any[] = [];

  for (const [agency, url] of Object.entries(FEEDS)) {
    try {
      const feed = await fetchFeed(agency, url);
      if (!feed || !feed.entity) continue;

      const stopPredictions: Record<string, any[]> = {};
      const routeId = agency === 'burlington' ? BURLINGTON_ROUTE_ID : (agency === 'hamilton' ? HAMILTON_ROUTE_ID : null);
      const targetStops = agency === 'burlington' ? BURLINGTON_TARGET_STOPS : (agency === 'hamilton' ? HAMILTON_TARGET_STOPS : null);

      for (const entity of feed.entity) {
        const tu = entity.tripUpdate;
        if (!tu || !tu.stopTimeUpdate) continue;
        if (routeId && tu.trip?.routeId !== routeId) continue;

        for (const stu of tu.stopTimeUpdate) {
          const stopId = String(stu.stopId);
          if (targetStops && !targetStops.has(stopId)) continue;
          
          const arrival = stu.arrival || stu.departure;
          if (!arrival || !arrival.time) continue;

          const predictedTime = parseInt(String(arrival.time));
          const delay = arrival.delay ? parseInt(String(arrival.delay)) : 0;
          const scheduledTime = predictedTime - delay;

          if (!stopPredictions[stopId]) stopPredictions[stopId] = [];
          stopPredictions[stopId].push({
            tripId: tu.trip?.tripId,
            routeId: tu.trip?.routeId,
            directionId: tu.trip?.directionId,
            scheduledTime,
            predictedTime,
            delay,
          });
        }
      }

      for (const [stopId, predictions] of Object.entries(stopPredictions)) {
        predictions.sort((a, b) => a.predictedTime - b.predictedTime);
        const gaps = [];
        for (let i = 1; i < predictions.length; i++) {
          gaps.push((predictions[i].predictedTime - predictions[i - 1].predictedTime) / 60);
        }

        snapshots.push({
          agency,
          stopId,
          predictions,
          avgGap: gaps.length > 0 ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length * 10) / 10 : null,
          lastUpdated: timestamp,
        });
      }
    } catch (err) {
      console.error(`Error polling ${agency}:`, err);
    }
  }

  if (snapshots.length > 0) {
    const filename = `atlas/realtime/snapshot-${timestamp.replace(/[:.]/g, '-')}.json`;
    
    // Save the individual snapshot
    await put(filename, JSON.stringify({ timestamp, arrivals: snapshots }), {
      access: 'public',
      contentType: 'application/json',
    });

    // Update a "latest" file for the frontend to consume easily
    await put('atlas/realtime/latest.json', JSON.stringify({ timestamp, arrivals: snapshots }), {
      access: 'public',
      contentType: 'application/json',
      allowOverwrite: true,
    });
    
    return new Response(`Saved snapshot with ${snapshots.length} arrivals`, { status: 200 });
  }

  return new Response('No data to save', { status: 200 });
}
