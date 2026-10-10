const PMTILES_BASE_URL = 'https://pub-85dc05d357954b6399c9a44018a3221e.r2.dev/';

export const config = { maxDuration: 60 };

const FORWARDED_HEADERS = [
  'accept-ranges',
  'content-length',
  'content-range',
  'content-type',
  'etag',
  'last-modified',
] as const;

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Range',
          'Access-Control-Max-Age': '3600',
        },
      });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }

    const params = new URL(request.url).searchParams;
    const variant = params.get('variant');
    // `release_id` avoids stale Vercel cache entries created for the old `release` query.
    // Keep accepting `release` so older deployed bundles continue to work.
    const release = params.get('release_id') ?? params.get('release');
    // Only serve tiles that belong to a verified data release. The legacy root
    // atlas.pmtiles is not paired with any agency data, so serving it would
    // draw a map that disagrees with the route cards; no tiles beats wrong tiles.
    if (!release || !/^release-[a-z0-9]+$/.test(release)) {
      return new Response('No verified data release requested', {
        status: 404,
        headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' },
      });
    }
    const releasePath = `atlas/releases/${release}/`;
    const filename = `${releasePath}${variant === 'overview' ? 'atlas-overview.pmtiles' : 'atlas.pmtiles'}`;
    const range = request.headers.get('range');
    const upstream = await fetch(`${PMTILES_BASE_URL}${filename}`, {
      method: request.method,
      headers: range ? { Range: range } : undefined,
    });
    const headers = new Headers();
    for (const name of FORWARDED_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    headers.set(
      'Cache-Control',
      upstream.ok ? 'public, s-maxage=3600, stale-while-revalidate=86400' : 'no-store',
    );
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Expose-Headers', FORWARDED_HEADERS.join(', '));

    return new Response(request.method === 'HEAD' ? null : upstream.body, {
      status: upstream.status,
      headers,
    });
  },
};
