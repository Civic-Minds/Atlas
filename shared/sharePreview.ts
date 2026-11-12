/**
 * Link previews for shared map links (CIV-1175): a link with a place in it (?lat=&lon=, or ?area=) shows a
 * ready-made map picture of that city instead of the default one. Social sites don't run JavaScript, so
 * vercel.json sends only their preview bots, and only for such links, to api/share-preview.ts, which
 * answers with this file's HTML. People always get the normal static page.
 *
 * Pure (no DOM, no import.meta), so the function, the prerender and the tests share it.
 */
import { SHARE_CITIES, type ShareCity } from './shareCities.js';
import { SITE_URL, imageMimeType, resolveSeo, type SeoMode } from './seo.js';

export type { ShareCity };

/** The picture for links with no place, or a place far from every pictured city. */
export const DEFAULT_SHARE_IMAGE = { path: '/assets/share/toronto.jpg', alt: 'Atlas frequency map of the Toronto area' };

/** A point outside every pictured city's area counts as that city only this close to its center. */
export const NEAREST_CITY_MAX_KM = 75;

const BY_SLUG = new Map(SHARE_CITIES.map(c => [c.slug, c]));

export function shareCityBySlug(slug: string | null | undefined): ShareCity | null {
  return (slug && BY_SLUG.get(slug.trim().toLowerCase())) || null;
}

export function shareImageForCity(city: ShareCity): { path: string; alt: string } {
  return { path: `/assets/share/${city.slug}.jpg`, alt: `Atlas frequency map of the ${city.name} area` };
}

function distanceKm(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLon = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Even-odd test of a [lon, lat] point against an area's boundary rings (holes and islands both work). */
function insideRings(lon: number, lat: number, rings: ShareCity['rings']): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/**
 * The pictured city for a point: the one whose official area holds it (the closer downtown in the rare overlap of
 * simplified edges), else the closest downtown within NEAREST_CITY_MAX_KM, else null (the default picture). Never
 * a far-away city.
 */
export function shareCityForPoint(lat: number, lon: number, cities: readonly ShareCity[] = SHARE_CITIES): ShareCity | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const p: [number, number] = [lat, lon];
  let best: { city: ShareCity; km: number; inside: boolean } | null = null;
  for (const city of cities) {
    const [s, w, n, e] = city.bbox;
    const inside = lat >= s && lat <= n && lon >= w && lon <= e && insideRings(lon, lat, city.rings);
    const km = distanceKm(p, city.center);
    if (!inside && km > NEAREST_CITY_MAX_KM) continue;
    if (!best || (inside && !best.inside) || (inside === best.inside && km < best.km)) best = { city, km, inside };
  }
  return best?.city ?? null;
}

/** The pictured city for a map link's query: its ?area= when that has a picture, else its ?lat=&lon=. */
export function shareCityForQuery(params: URLSearchParams): ShareCity | null {
  const byArea = shareCityBySlug(params.get('area'));
  if (byArea) return byArea;
  const lat = params.get('lat');
  const lon = params.get('lon');
  if (lat === null || lon === null || lat.trim() === '' || lon.trim() === '') return null;
  return shareCityForPoint(Number(lat), Number(lon));
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * The page a preview bot gets for a shared map link: the home page's title and description, og:url the link
 * itself (so a click opens the same spot), and the city's picture. Images always come from the production
 * host, which a bot can always fetch.
 */
export function sharePreviewHtml(opts: { search: string; mode: SeoMode; origin?: string }): string {
  const origin = (opts.origin ?? SITE_URL).replace(/\/$/, '');
  const params = new URLSearchParams(opts.search);
  const city = shareCityForQuery(params);
  const image = city ? shareImageForCity(city) : DEFAULT_SHARE_IMAGE;
  const seo = resolveSeo('/', { mode: opts.mode, flags: {}, origin });
  const query = params.toString();
  const url = `${origin}/${query ? `?${query}` : ''}`;
  const t = escapeAttr(seo.title);
  const d = escapeAttr(seo.description);
  const u = escapeAttr(url);
  const img = escapeAttr(`${SITE_URL}${image.path}`);
  const lines = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8" />',
    `<title>${t}</title>`,
    `<meta name="description" content="${d}" />`,
    `<link rel="canonical" href="${escapeAttr(seo.canonicalUrl)}" />`,
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="Atlas" />',
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:url" content="${u}" />`,
    `<meta property="og:image" content="${img}" />`,
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    `<meta property="og:image:type" content="${imageMimeType(image.path)}" />`,
    `<meta property="og:image:alt" content="${escapeAttr(image.alt)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${img}" />`,
    // Only bots get this page, but it never asks to be indexed under the link's query.
    '<meta name="robots" content="noindex" />',
    '</head>',
    `<body><a href="${u}">${t}</a></body>`,
    '</html>',
  ];
  return `${lines.join('\n')}\n`;
}

/**
 * An area page's link-preview image, or an agency page's (its area's): the city picture as resolveSeo's `image`, or
 * nothing (the page keeps the default picture from index.html) when the area has no picture.
 */
export function areaShareImageSeo(areaSlug: string | null | undefined): { image?: { url: string; alt: string } } {
  const city = shareCityBySlug(areaSlug);
  if (!city) return {};
  const image = shareImageForCity(city);
  return { image: { url: `${SITE_URL}${image.path}`, alt: image.alt } };
}
