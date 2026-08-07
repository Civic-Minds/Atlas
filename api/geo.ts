import { requestHeader } from '../shared/request.js';
import { jsonResponse, type ApiResponse } from '../shared/http.js';
import type { ApiRequest } from '../shared/request.js';

/**
 * Approximate (city-level) location fallback for when the browser's own
 * navigator.geolocation fails -- e.g. Wi-Fi-based positioning has nothing to
 * triangulate from (Ethernet-only, Wi-Fi off), which fails identically for
 * every site/app on the machine, not just Atlas. Vercel injects these
 * headers on every request from its edge network, so this needs no external
 * geolocation service or API key.
 */
export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
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
