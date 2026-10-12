/**
 * Checks an on-demand release before it is published (CIV-50), the zone counterpart of
 * releaseDiff.ts. A red flag holds back only that service: its live version stays published.
 */
import type { OnDemandGeometry, OnDemandIndex, OnDemandIndexEntry } from '../shared/onDemandData.js';
import { localDateIn } from '../shared/onDemandAvailability.js';
import { agencyTimeZone } from '../src/data/onDemandExport.js';

export type OnDemandFlag =
  | 'invalid'
  | 'paratransit'
  | 'placeholder'
  | 'zone-drop'
  | 'hours-lost'
  | 'leak'
  | 'stale-source'
  | 'expired-zone';

export interface OnDemandFinding {
  slug: string;
  flag: OnDemandFlag;
  severity: 'red' | 'yellow';
  detail: string;
}

export interface OnDemandSnapshot {
  index: OnDemandIndex;
  geometries: ReadonlyMap<string, OnDemandGeometry>;
}

const STALE_YELLOW_DAYS = 180;
const STALE_RED_DAYS = 365;
const ZONE_AREA_DROP = 0.3;
// Words that mark eligibility-only service anywhere riders read about it. "ADA" stays
// case-sensitive so Ada County doesn't read as ADA paratransit.
const ELIGIBILITY_ONLY = [
  /\bADA\b/,
  /paratransit|eligib|seniors? only|disabled only|medicaid|\bNEMT\b|specialized|wheel-?trans|seniors and persons with disabilities/i,
];
// Words that only mean eligibility-only in a service or zone name or the eligibility text: booking
// notes say "wheelchair-accessible vans" and agencies say "mobility" about ordinary service.
const ELIGIBILITY_ONLY_IN_NAMES = /accessible|mobility/i;
/** Rider-facing fields that would say who may ride. */
const ELIGIBILITY_FIELDS = ['serviceName', 'sourceLabel', 'tripRules', 'bookingInfo', 'hoursNote', 'eligibility', 'serviceHours'];
const NAME_FIELDS = ['serviceName', 'eligibility'];

type Ring = [number, number][];

function rings(feature: GeoJSON.Feature): Ring[] {
  const g = feature.geometry;
  if (g?.type === 'Polygon') return g.coordinates as Ring[];
  if (g?.type === 'MultiPolygon') return (g.coordinates as Ring[][]).flat();
  return [];
}

/** Planar ring area in square degrees, scaled by latitude; only compared against itself. */
function ringArea(ring: Ring): number {
  let sum = 0;
  for (let i = 1; i < ring.length; i++) sum += ring[i - 1][0] * ring[i][1] - ring[i][0] * ring[i - 1][1];
  const lat = ring.length ? ring[0][1] : 0;
  return Math.abs(sum / 2) * Math.cos((lat * Math.PI) / 180);
}

function totalArea(geometry: OnDemandGeometry | undefined): number {
  if (!geometry) return 0;
  return geometry.features.flatMap(rings).reduce((sum, ring) => sum + ringArea(ring), 0);
}

/**
 * Whether a ring crosses or touches itself: a vertex repeated before the closing point (a
 * figure-eight) or two non-adjacent edges that cross. Map renderers draw such rings unpredictably.
 */
export function ringSelfIntersects(ring: Ring): boolean {
  const n = ring.length - 1; // last point repeats the first
  if (n < 3) return false;
  const seen = new Set<string>();
  for (let i = 0; i < n; i++) {
    const key = `${ring[i][0]},${ring[i][1]}`;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  const orient = (a: number[], b: number[], c: number[]) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  // Sweep along x: only edges whose x-ranges overlap can cross, so sorting by left edge
  // avoids testing every pair (real zone outlines run to tens of thousands of points).
  const minX = new Float64Array(n), maxX = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    minX[i] = Math.min(ring[i][0], ring[i + 1][0]);
    maxX[i] = Math.max(ring[i][0], ring[i + 1][0]);
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((p, q) => minX[p] - minX[q]);
  for (let s = 0; s < n; s++) {
    const i = order[s];
    const a = ring[i], b = ring[i + 1];
    const minY = Math.min(a[1], b[1]), maxY = Math.max(a[1], b[1]);
    for (let t = s + 1; t < n && minX[order[t]] <= maxX[i]; t++) {
      const j = order[t];
      const lo = Math.min(i, j), hi = Math.max(i, j);
      if (hi - lo < 2) continue; // adjacent edges share a point
      if (lo === 0 && hi === n - 1) continue; // first and last edges share the closing point
      const c = ring[j], d = ring[j + 1];
      if (Math.max(c[1], d[1]) < minY || Math.min(c[1], d[1]) > maxY) continue;
      const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
      if (o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0) return true;
    }
  }
  return false;
}

function validCoordinate(c: unknown): boolean {
  return Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number'
    && c[0] >= -180 && c[0] <= 180 && c[1] >= -90 && c[1] <= 90;
}

function hasHours(entry: OnDemandIndexEntry | undefined): boolean {
  if (!entry) return false;
  const area = entry.area as { availability?: unknown; zoneMetadata?: Record<string, { availability?: unknown }> };
  return !!area.availability || Object.values(area.zoneMetadata ?? {}).some(zone => !!zone.availability);
}

function serviceText(entry: OnDemandIndexEntry, geometry: OnDemandGeometry | undefined, fields: readonly string[]): string {
  const area = entry.area as Record<string, unknown>;
  const texts: unknown[] = [...fields.map(field => area[field]), entry.agency?.name];
  for (const [name, zone] of Object.entries((area.zoneMetadata ?? {}) as Record<string, Record<string, unknown>>)) {
    texts.push(name, ...fields.map(field => zone?.[field]));
  }
  for (const f of geometry?.features ?? []) texts.push(f.id, f.properties?.name, f.properties?.areaName, f.properties?.serviceName);
  return texts.filter(t => typeof t === 'string' || typeof t === 'number').join(' ');
}

/** Problems with a release on its own and against what's live (null live = first publish). */
export function evaluateOnDemandRelease(
  next: OnDemandSnapshot,
  live: OnDemandSnapshot | null,
  options: {
    audience: 'beta' | 'public';
    /** Services promoted to the public site, kept apart from each entry's own `public` field. */
    promoted: ReadonlySet<string>;
    now?: Date;
  },
): OnDemandFinding[] {
  const findings: OnDemandFinding[] = [];
  const now = options.now ?? new Date();
  const add = (slug: string, flag: OnDemandFlag, severity: 'red' | 'yellow', detail: string) =>
    findings.push({ slug, flag, severity, detail });

  for (const entry of next.index.services) {
    const geometry = next.geometries.get(entry.slug);
    if (!geometry) { add(entry.slug, 'invalid', 'red', 'geometry file missing'); continue; }
    if (geometry.features.length === 0 && !(geometry.stopFeatures?.length)) add(entry.slug, 'invalid', 'red', 'no zones or stops');
    for (const feature of geometry.features) {
      for (const ring of rings(feature)) {
        const first = ring[0], last = ring[ring.length - 1];
        if (ring.length < 4 || !first || !last || first[0] !== last[0] || first[1] !== last[1]) {
          add(entry.slug, 'invalid', 'red', `zone ${feature.id ?? '?'} has an open ring`);
        }
        if (!ring.every(validCoordinate)) add(entry.slug, 'invalid', 'red', `zone ${feature.id ?? '?'} has a coordinate out of range`);
        else if (ringSelfIntersects(ring)) {
          const name = (feature.properties as { areaName?: string } | null)?.areaName ?? feature.id ?? '?';
          add(entry.slug, 'invalid', 'red', `zone ${name} crosses itself`);
        }
      }
    }
    for (const stop of geometry.stopFeatures ?? []) {
      if (stop.geometry?.type !== 'Point' || !validCoordinate(stop.geometry.coordinates)) {
        add(entry.slug, 'invalid', 'red', `stop ${stop.id ?? '?'} is not a valid point`);
      }
    }
    const text = serviceText(entry, geometry, ELIGIBILITY_FIELDS);
    const names = serviceText(entry, geometry, NAME_FIELDS);
    if (ELIGIBILITY_ONLY.some(pattern => pattern.test(text)) || ELIGIBILITY_ONLY_IN_NAMES.test(names)) {
      add(entry.slug, 'paratransit', 'red', 'looks eligibility-only; never drawn');
    }
    if (/placeholder/i.test(text)) add(entry.slug, 'placeholder', 'red', 'placeholder zone');
    // The release build already keeps unpromoted services out of the public audience; this guards
    // files that were hand-edited or carried over from a live release, which skip that build.
    if (options.audience === 'public' && !options.promoted.has(entry.slug)) {
      add(entry.slug, 'leak', 'red', 'service not promoted is in the public release');
    }
    if (entry.public !== options.promoted.has(entry.slug)) {
      add(entry.slug, 'leak', 'red', `marked ${entry.public ? 'public' : 'beta-only'} but ${options.promoted.has(entry.slug) ? '' : 'not '}promoted`);
    }

    const retrieved = entry.area.sourceRetrievedAt ? Date.parse(entry.area.sourceRetrievedAt) : NaN;
    if (Number.isNaN(retrieved)) {
      add(entry.slug, 'stale-source', 'yellow', 'no source date');
    } else {
      const days = (now.getTime() - retrieved) / 86_400_000;
      if (days > STALE_RED_DAYS) add(entry.slug, 'stale-source', 'red', `source checked ${Math.floor(days)} days ago`);
      else if (days > STALE_YELLOW_DAYS) add(entry.slug, 'stale-source', 'yellow', `source checked ${Math.floor(days)} days ago`);
    }

    // Backstop only: the release build already drops zones past their end date.
    // The agency's local date, from its config time zone, exactly as the release build reads it.
    const today = localDateIn(agencyTimeZone(entry.slug, entry.agency), now);
    const zones = Object.entries((entry.area as { zoneMetadata?: Record<string, { validUntil?: string }> }).zoneMetadata ?? {});
    for (const [name, zone] of [['(service)', entry.area as { validUntil?: string }] as const, ...zones]) {
      if (zone?.validUntil && zone.validUntil < today) add(entry.slug, 'expired-zone', 'red', `${name} ran until ${zone.validUntil}`);
    }

    const before = live?.index.services.find(s => s.slug === entry.slug);
    if (before) {
      // Live zones that have since passed their end date are expected to go, not a drop.
      const ended = new Set(Object.entries((before.area as { zoneMetadata?: Record<string, { validUntil?: string }> }).zoneMetadata ?? {})
        .filter(([, zone]) => zone?.validUntil && zone.validUntil < today).map(([name]) => name));
      const liveGeometry = live?.geometries.get(entry.slug);
      const beforeGeometry = liveGeometry && {
        ...liveGeometry,
        features: liveGeometry.features.filter(f => !ended.has(String((f.properties as { areaName?: string } | null)?.areaName ?? ''))),
      };
      const beforeZones = beforeGeometry?.features.length ?? 0;
      if (geometry.features.length < beforeZones) {
        add(entry.slug, 'zone-drop', 'red', `zones ${beforeZones} → ${geometry.features.length}`);
      } else {
        const a0 = totalArea(beforeGeometry), a1 = totalArea(geometry);
        if (a0 > 0 && a1 < a0 * (1 - ZONE_AREA_DROP)) add(entry.slug, 'zone-drop', 'red', `area down ${Math.round((1 - a1 / a0) * 100)}%`);
      }
      if (hasHours(before) && !hasHours(entry)) add(entry.slug, 'hours-lost', 'red', 'hours were published and are now missing');
    }
  }

  for (const before of live?.index.services ?? []) {
    if (!next.index.services.some(s => s.slug === before.slug)) add(before.slug, 'zone-drop', 'red', 'service removed');
  }
  return findings;
}

/** Slugs a red flag holds back, after `slug:flag` overrides. */
export function heldBack(findings: readonly OnDemandFinding[], allow: ReadonlySet<string> = new Set()): Set<string> {
  return new Set(findings.filter(f => f.severity === 'red' && !allow.has(`${f.slug}:${f.flag}`)).map(f => f.slug));
}
