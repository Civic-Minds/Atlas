import { requestHeader } from '../shared/request.js';
import { jsonResponse, type ApiResponse } from '../shared/http.js';
import type { ApiRequest } from '../shared/request.js';
import { privacyRegionResponse } from '../shared/privacyRegion.js';

/**
 * Approximate (city-level) location fallback for when the browser's own
 * navigator.geolocation fails -- e.g. Wi-Fi-based positioning has nothing to
 * triangulate from (Ethernet-only, Wi-Fi off), which fails identically for
 * every site/app on the machine, not just Atlas. Vercel injects these
 * headers on every request from its edge network, so this needs no external
 * geolocation service or API key.
 */
export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'https://atlas.invalid');
  if (url.searchParams.get('mode') === 'privacy-region') {
    const headers = new Headers();
    const sourceHeaders = req.headers;
    if (typeof (sourceHeaders as Headers).forEach === 'function') {
      (sourceHeaders as Headers).forEach((value, name) => headers.set(name, value));
    } else {
      for (const [name, value] of Object.entries(sourceHeaders as Record<string, string | string[] | undefined>)) {
        if (typeof value === 'string') headers.set(name, value);
        else if (Array.isArray(value) && value[0]) headers.set(name, value[0]);
      }
    }
    const response = privacyRegionResponse(new Request(url, { headers }));
    res.statusCode = response.status;
    response.headers.forEach((value, name) => res.setHeader(name, value));
    res.end(await response.text());
    return;
  }

  const lat = requestHeader(req, 'x-vercel-ip-latitude');
  const lon = requestHeader(req, 'x-vercel-ip-longitude');
  if (!lat || !lon) {
    return jsonResponse(res, { error: 'No approximate location available' }, 404);
  }
  return jsonResponse(res, {
    latitude: Number(lat),
    longitude: Number(lon),
    city: requestHeader(req, 'x-vercel-ip-city'),
    approximate: true,
  });
}
