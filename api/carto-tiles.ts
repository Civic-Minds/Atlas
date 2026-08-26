const CARTO_HOSTS = ['a', 'b', 'c', 'd'] as const;
const CARTO_STYLES = new Set(['light_all', 'dark_all']);

function errorResponse(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
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
    const isTilePart = (value: string | null): value is string => Boolean(value && /^\d+$/.test(value));
    if (!style || !CARTO_STYLES.has(style) || !isTilePart(z) || !isTilePart(x) || !isTilePart(y)) {
      return errorResponse('Invalid tile request', 400);
    }

    const host = CARTO_HOSTS[(Number(x) + Number(y)) % CARTO_HOSTS.length];
    const upstreamUrl = `https://${host}.basemaps.cartocdn.com/${style}/${z}/${x}/${y}.png?key=${encodeURIComponent(key)}`;
    const upstream = await fetch(upstreamUrl, { method: request.method });
    const headers = new Headers();
    const contentType = upstream.headers.get('content-type');
    if (contentType) headers.set('Content-Type', contentType);
    headers.set('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');

    return new Response(request.method === 'HEAD' ? null : upstream.body, {
      status: upstream.status,
      headers,
    });
  },
};
