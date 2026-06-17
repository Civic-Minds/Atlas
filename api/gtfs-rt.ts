import GtfsRealtimeBindings from 'gtfs-realtime-bindings';

export const config = {
  maxDuration: 60,
};

function queryParams(req: Request & { url?: string }): URLSearchParams {
  const raw = req.url ?? '';
  const qs = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : raw;
  return new URLSearchParams(qs);
}

const FEEDS = {
  burlington: 'https://opendata.burlington.ca/gtfs-rt/GTFS_TripUpdates.pb',
  hamilton: 'https://opendata.hamilton.ca/GTFS-RT/GTFS_TripUpdates.pb',
};

export default async function handler(req: Request) {
  const agency = queryParams(req).get('agency');

  if (!agency || !FEEDS[agency as keyof typeof FEEDS]) {
    return new Response(JSON.stringify({ error: 'Invalid agency. Use burlington or hamilton.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const feedUrl = FEEDS[agency as keyof typeof FEEDS];
  const headers: Record<string, string> = {};

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

    return new Response(JSON.stringify(json), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=30',
      },
    });
  } catch (err: unknown) {
    console.error('[gtfs-rt]', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
