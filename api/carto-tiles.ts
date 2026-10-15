const CARTO_HOSTS = ['a', 'b', 'c', 'd'] as const;
const CARTO_STYLES = new Set(['light_all', 'dark_all']);
// Browsers keep a good tile for 7 days (short enough to recover if CARTO relabels its watermark tile);
// Vercel's edge keeps it a year
// and serves stale for another 30 days while revalidating, so few requests reach this function.
const TILE_CACHE_OK = 'public, max-age=604800, s-maxage=31536000, stale-while-revalidate=2592000';
const TILE_CACHE_NONE = 'no-store, max-age=0';
// MapLibre's default zoom range. Anything outside it (or any extra query param)
// is rejected so junk URLs can't create new edge-cache keys that each cost a CARTO fetch.
const MAX_ZOOM = 22;
const ALLOWED_PARAMS = new Set(['style', 'z', 'x', 'y']);

// CARTO answers a missing or invalid key with HTTP 200 and an "API KEY REQUIRED" watermark tile,
// marked by an ETag starting with "wm-". Never let that be cached as if it were a real tile.
function isWatermarkTile(upstream: Response): boolean {
  return /^(W\/)?"?wm-/.test(upstream.headers.get('etag') ?? '');
}

function errorResponse(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': TILE_CACHE_NONE },
  });
}

export async function handleCartoTiles(request: Request): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return errorResponse('Method not allowed', 405);
  }

  const url = new URL(request.url);
  const style = url.searchParams.get('style');
  const z = url.searchParams.get('z');
  const x = url.searchParams.get('x');
  const y = url.searchParams.get('y');
  const key = process.env.CARTO_BASEMAP_API_KEY;

  if (!key) return errorResponse('Basemap is not configured', 503);
  const isTilePart = (value: string | null): value is string => Boolean(value && /^(0|[1-9]\d{0,6})$/.test(value));
  const paramNames = [...url.searchParams.keys()];
  // Exactly style, z, x, y once each: extra or repeated params would vary the cache key.
  const hasOnlyAllowedParams = paramNames.length === ALLOWED_PARAMS.size
    && paramNames.every(name => ALLOWED_PARAMS.has(name));
  if (!hasOnlyAllowedParams || !style || !CARTO_STYLES.has(style) || !isTilePart(z) || !isTilePart(x) || !isTilePart(y)) {
    return errorResponse('Invalid tile request', 400);
  }
  const tilesPerSide = 2 ** Number(z);
  if (Number(z) > MAX_ZOOM || Number(x) >= tilesPerSide || Number(y) >= tilesPerSide) {
    return errorResponse('Invalid tile request', 400);
  }

  const host = CARTO_HOSTS[(Number(x) + Number(y)) % CARTO_HOSTS.length];
  const upstreamUrl = `https://${host}.basemaps.cartocdn.com/${style}/${z}/${x}/${y}.png?key=${encodeURIComponent(key)}`;
  const upstream = await fetch(upstreamUrl, { method: request.method });
  const headers = new Headers();
  const contentType = upstream.headers.get('content-type');
  if (contentType) headers.set('Content-Type', contentType);

  const cacheable = upstream.ok && !isWatermarkTile(upstream);
  headers.set('Cache-Control', cacheable ? TILE_CACHE_OK : TILE_CACHE_NONE);

  return new Response(request.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    headers,
  });
}

export default {
  fetch: handleCartoTiles,
};
