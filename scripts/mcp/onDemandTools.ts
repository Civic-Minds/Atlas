/**
 * on_demand_zones (CIV-2078): an agency's on-demand zones, or those covering or near a place, with each zone's hours,
 * booking, pickup and trip rules. It reads the published on-demand release the map reads (shared/onDemandData.ts,
 * beta bucket for now) and words every field as the map's zone card does (resolveOnDemandZone,
 * formatOnDemandHoursLines, onDemandPickupSentence). Local and hosted servers both serve it.
 */
import type * as GeoJSON from 'geojson';
import { DEFAULT_BETA_R2_PUBLIC_URL } from '../../shared/rules/paths';
import { ON_DEMAND_PREFIX, ON_DEMAND_SCHEMA_VERSION, type OnDemandGeometry, type OnDemandIndex, type OnDemandIndexEntry, type OnDemandManifest } from '../../shared/onDemandData';
import { formatOnDemandHoursLines, localDateIn, onDemandZonesInEffect, resolveOnDemandZone, type OnDemandServiceDetails } from '../../shared/onDemandAvailability';
import { metresBetween } from '../../shared/geoDistance';
import { insideRings } from '../../shared/sharePreview';
import { MCP_POINTER_RECHECK_MS, NEARBY_ROUTES_RADIUS_M } from '../../shared/rules/limits';
import { BETA_SERVICE_ROLLOUT_NOTICE, ON_DEMAND_NOT_MAPPED_NOTE, onDemandPickupSentence } from '../../src/content/noticeCopy';
import { ON_DEMAND_NOT_MAPPED } from '../../src/data/onDemandCoverage';
import * as data from './atlasData';
import type { Args } from './toolHelpers';

// The beta bucket's release, beta-only services included and each answer marked as beta (manager, 2026-11-21, option 1:
// the pilot is invite-only and no on-demand zone is public yet). Revisit when on-demand goes public (CIV-2078).
let BASE = `${DEFAULT_BETA_R2_PUBLIC_URL}/${ON_DEMAND_PREFIX}`;
/** Where the on-demand release is read from (tests, and a server told to read another bucket). */
let BETA = true;
export function useOnDemandBase(base: string, beta = BETA) { BASE = base.replace(/\/$/, ''); BETA = beta; cached = null; }
const SOURCE = "Atlas's published on-demand zones, the same the map draws, from each agency's own zone maps and pages.";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Atlas couldn't read its on-demand zones (${res.status}).`);
  return res.json() as Promise<T>;
}

/** The release is read once per version; the pointer is re-read when a call finds the cached one gone stale. */
let cached: { index: OnDemandIndex; geometry: Map<string, Promise<OnDemandGeometry>>; checkedAt: number } | null = null;

async function release() {
  if (cached && Date.now() - cached.checkedAt < MCP_POINTER_RECHECK_MS) return cached;
  const manifest = await getJson<OnDemandManifest>(`${BASE}/manifest.json`);
  if (manifest.schemaVersion !== ON_DEMAND_SCHEMA_VERSION) throw new Error('Atlas can’t read this on-demand release yet.');
  if (cached?.index.version === manifest.version) return (cached = { ...cached, checkedAt: Date.now() });
  const index = await getJson<OnDemandIndex>(`${BASE}/${manifest.indexKey}`);
  return (cached = { index, geometry: new Map(), checkedAt: Date.now() });
}

function geometryOf(r: NonNullable<typeof cached>, entry: OnDemandIndexEntry) {
  let p = r.geometry.get(entry.slug);
  if (!p) {
    p = getJson<OnDemandGeometry>(`${BASE}/v/${r.index.version}/${entry.geometryKey}`);
    p.catch(() => r.geometry.delete(entry.slug));
    r.geometry.set(entry.slug, p);
  }
  return p;
}

type Ring = number[][];
const polygonsOf = (g: GeoJSON.Geometry | null): Ring[][] => (g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : []);

/** 0 inside the zone, else the metres to its outline. */
function metresFrom(point: { lat: number; lon: number }, g: GeoJSON.Geometry | null): number | null {
  const polygons = polygonsOf(g);
  if (!polygons.length) return null;
  if (polygons.some(rings => insideRings(point.lon, point.lat, rings))) return 0;
  // The closest point on each outline edge, found on a flat local projection (fine at these distances), then measured.
  const kx = Math.cos((point.lat * Math.PI) / 180);
  let best = Infinity;
  for (const rings of polygons) for (const ring of rings) for (let i = 1; i < ring.length; i++) {
    const [ax, ay] = [(ring[i - 1][0] - point.lon) * kx, ring[i - 1][1] - point.lat], [bx, by] = [(ring[i][0] - point.lon) * kx, ring[i][1] - point.lat];
    const len = (bx - ax) ** 2 + (by - ay) ** 2;
    const t = len ? Math.max(0, Math.min(1, -(ax * (bx - ax) + ay * (by - ay)) / len)) : 0;
    best = Math.min(best, metresBetween(point, { lat: point.lat + ay + t * (by - ay), lon: point.lon + (ax + t * (bx - ax)) / kx }));
  }
  return best;
}

/** One zone as the map's zone card words it. */
function zoneText(service: OnDemandServiceDetails, areaName: string | undefined) {
  const z = resolveOnDemandZone(service, areaName);
  const hours = formatOnDemandHoursLines(z.availability).map(l => l.text);
  const out = {
    zone: areaName ?? z.serviceName ?? null,
    service: z.serviceName ?? null,
    serviceHours: hours.length ? hours : z.serviceHours ?? null,
    ...(z.hoursNote ? { hoursNote: z.hoursNote } : {}),
    ...(z.eligibility ? { eligibility: z.eligibility } : {}),
    pickup: onDemandPickupSentence(service, areaName),
    tripRules: z.tripRules ?? null,
    booking: z.bookingInfo ?? null,
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v != null));
}

export const onDemandHandlers: Record<string, (args: Args) => unknown | Promise<unknown>> = {
  on_demand_zones: async ({ agency: q, place, metres }) => {
    const query = String(q ?? '').trim();
    const r = await release();
    const catalogAgency = await data.findAgency(query, await data.publicAgencies());
    // An agency that runs only on-demand has no fixed-route entry; the release lists it with its own name.
    const entry = catalogAgency
      ? r.index.services.find(s => s.slug === catalogAgency.slug)
      : r.index.services.find(s => s.agency && (s.slug === query.toLowerCase() || s.agency.name.toLowerCase().includes(query.toLowerCase())));
    const name = catalogAgency?.name ?? entry?.agency?.name;
    if (!entry || (!entry.public && !BETA)) {
      if (!name) throw new Error(`No agency matches "${query}". Use list_agencies to search.`);
      const unmapped = catalogAgency && ON_DEMAND_NOT_MAPPED[catalogAgency.slug];
      return { agency: name, zones: [], note: unmapped ? `${ON_DEMAND_NOT_MAPPED_NOTE} Atlas has no outline or hours for it.` : `Atlas has no on-demand zones for ${name}.` };
    }
    const geometry = await geometryOf(r, entry);
    const timeZone = (catalogAgency as { timezone?: string } | null)?.timezone ?? (entry.agency?.timezone as string | undefined);
    const service = onDemandZonesInEffect({ ...(entry.area as Omit<OnDemandServiceDetails, 'features'>), features: geometry.features, stopFeatures: geometry.stopFeatures }, localDateIn(timeZone)) as OnDemandServiceDetails & { features: GeoJSON.Feature[]; sourceUrl?: string };
    const zones = service.features as GeoJSON.Feature[];
    const base = { agency: name, ...(entry.public ? {} : { beta: BETA_SERVICE_ROLLOUT_NOTICE }), sourceUrl: service.sourceUrl ?? entry.area.sourceUrl, source: SOURCE };
    const areaName = (f: GeoJSON.Feature) => (f.properties as { areaName?: string } | null)?.areaName;
    // A zone drawn in several pieces is listed once.
    const once = <T extends { f: GeoJSON.Feature }>(list: T[]) => list.filter((x, i) => list.findIndex(y => areaName(y.f) === areaName(x.f)) === i);
    const all = () => once(zones.map(f => ({ f }))).map(({ f }) => zoneText(service, areaName(f)));
    if (place == null || String(place).trim() === '') return { ...base, zones: all() };

    const within = metres != null ? Number(metres) : NEARBY_ROUTES_RADIUS_M;
    if (!catalogAgency || !(await data.availableAgencies()).some(a => a.slug === catalogAgency.slug)) {
      return { ...base, place, zones: all(), note: `Atlas can't place "${place}" for ${name} here (it places a corner or station by the agency's stops), so these are all its zones.` };
    }
    const { seeds, corner } = await data.placeStops(catalogAgency, String(place));
    if (!seeds.length) return { ...base, place, zones: all(), note: 'No stop name matches every part of that place, so these are all the zones. Try a station or a street name as the stops are named.' };
    const near = zones.map(f => {
      const d = Math.min(...seeds.map(s => metresFrom({ lat: s.lat, lon: s.lon }, f.geometry) ?? Infinity));
      return { f, d };
    }).filter(x => x.d <= within).sort((a, b) => a.d - b.d);
    const nearOnce = once(near);
    return {
      ...base, place, matchedStops: [...new Set(seeds.map(s => s.name))].slice(0, 8), ...(corner ? { matchedAs: `No stop is named for both streets; these are the closest stops on each, ${corner.apart} m apart.` } : {}), within,
      zones: nearOnce.map(({ f, d }) => ({ ...zoneText(service, areaName(f)), covers: d === 0, ...(d > 0 ? { metresAway: Math.round(d) } : {}) })),
      ...(near.length ? {} : { note: `No on-demand zone of ${name} covers that place or comes within ${within} m. Ask without a place for all its zones.` }),
    };
  },
};
