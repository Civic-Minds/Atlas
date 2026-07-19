import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { isLiveApiServable } from '../shared/livePollingConfig.js';
import { isRateLimited, rateLimitWebResponse } from '../shared/rateLimit.js';
import { requestHeader } from '../shared/request.js';

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
  const ip = requestHeader(req, 'x-real-ip') ?? requestHeader(req, 'x-forwarded-for')?.split(',')[0].trim() ?? '127.0.0.1';
  if (isRateLimited(ip)) {
    return rateLimitWebResponse();
  }

  const agency = queryParams(req).get('agency');

  if (!agency || !FEEDS[agency as keyof typeof FEEDS] || !isLiveApiServable(agency)) {
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
      console.error(`[gtfs-rt] upstream HTTP ${response.status} for ${agency}`);
      return new Response(JSON.stringify({ error: 'Feed unavailable' }), {
        status: 502,
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
