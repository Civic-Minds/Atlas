import { computeLiveAdherence } from '../../shared/computeLiveAdherence.js';
import { getLiveRouteConfig } from '../../shared/livePollingConfig.js';

export const config = { maxDuration: 60 };

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const agency = url.searchParams.get('agency');
  const route = url.searchParams.get('route');

  if (!agency || !route || !getLiveRouteConfig(agency, route)) {
    return new Response(JSON.stringify({ error: 'Invalid agency/route pair.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const data = await computeLiveAdherence(agency, route);
    if (!data || data.arrivals.length === 0) {
      return new Response(JSON.stringify({ noData: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=30',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
