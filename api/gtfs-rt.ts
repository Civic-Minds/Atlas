import GtfsRealtimeBindings from 'gtfs-realtime-bindings';

export const config = {
  maxDuration: 60,
};

const FEEDS = {
  burlington: 'https://opendata.burlington.ca/gtfs-rt/GTFS_TripUpdates.pb',
  hamilton: 'https://opendata.hamilton.ca/GTFS-RT/GTFS_TripUpdates.pb',
  go: 'https://api.metrolinx.com/gtfs/v1/tripupdates',
};

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const agency = url.searchParams.get('agency');

  if (!agency || !FEEDS[agency as keyof typeof FEEDS]) {
    return new Response(JSON.stringify({ error: 'Invalid agency. Use burlington, hamilton, or go.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const feedUrl = FEEDS[agency as keyof typeof FEEDS];
  const headers: Record<string, string> = {};

  if (agency === 'go') {
    const key = process.env.METROLINX_API_KEY;
    if (!key) {
      return new Response(JSON.stringify({ error: 'Missing METROLINX_API_KEY environment variable.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    headers['X-API-KEY'] = key;
  }

  try {
    const response = await fetch(feedUrl, { headers });
    if (!response.ok) {
      return new Response(JSON.stringify({ error: `Fetch failed with status ${response.status}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const buffer = await response.arrayBuffer();
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
    
    // Convert to plain object
    const json = GtfsRealtimeBindings.transit_realtime.FeedMessage.toObject(feed, {
      longs: String,
      enums: String,
      bytes: String,
    });

    // Optional: Filter GO rail routes if specified in AI-50
    if (agency === 'go' && json.entity) {
      const railRoutes = new Set(['0', '1', '2', '3', '4', '5', '6', '7']);
      json.entity = json.entity.filter((e: any) => 
        e.tripUpdate?.trip?.routeId && railRoutes.has(String(e.tripUpdate.trip.routeId))
      );
    }

    return new Response(JSON.stringify(json), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=30',
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
