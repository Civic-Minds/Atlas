import type { ApiRequest } from '../shared/request.js';
import type { ApiResponse } from '../shared/http.js';
import { frameLines, renderLinesPng } from '../shared/shareImage.js';
import { resolveDataRelease, dataReleasePmtilesUrl } from '../src/lib/dataRelease.js';
import { DEFAULT_SHARE_IMAGE, shareCityForPoint, shareImageForCity, sharePointFromQuery } from '../shared/sharePreview.js';

/**
 * The link-preview picture for a shared map link's exact spot (CIV-1393): Atlas's frequency lines around it, drawn
 * from the published map tiles. Only preview bots fetch it (share-preview names it), once per rounded spot: the
 * picture is cached at the edge for a day. Where Atlas has no lines in the frame, or anything fails, it sends the
 * bot to the nearest city's ready-made picture instead of a blank one.
 */
export const SHARE_IMAGE_CACHE = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';
const FALLBACK_CACHE = 'public, max-age=300, s-maxage=300';

function fallback(res: ApiResponse, lat?: number, lon?: number): void {
  const city = lat !== undefined && lon !== undefined ? shareCityForPoint(lat, lon) : null;
  res.statusCode = 302;
  res.setHeader('Location', (city ? shareImageForCity(city) : DEFAULT_SHARE_IMAGE).path);
  res.setHeader('Cache-Control', FALLBACK_CACHE);
  res.end();
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'https://atlas.invalid');
  const point = sharePointFromQuery(url.searchParams);
  if (!point) return fallback(res);
  const lat = Number(point.lat), lon = Number(point.lon);
  try {
    const release = await resolveDataRelease();
    const archive = dataReleasePmtilesUrl(release, 'detail', true);
    if (!release || !archive) return fallback(res, lat, lon);
    const lines = await frameLines(archive, lat, lon);
    if (lines.length === 0) return fallback(res, lat, lon);
    const png = renderLinesPng(lines);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', SHARE_IMAGE_CACHE);
    res.end(png);
  } catch {
    fallback(res, lat, lon);
  }
}
