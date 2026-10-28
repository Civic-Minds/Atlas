/**
 * PROTOTYPE (CIV-422, not for merge): tell a reused route number apart from the same route, by long name
 * and terminus. A route key's periods are read in date order; between two neighbouring periods the route
 * is a different route when its long name changes AND its line's two ends moved (or there is no line on
 * either side to compare). A rename on the same line ("Red Line" -> "Red Line BRT") and a terminus change
 * under the same name both stay one route. Pure; build-history applies it behind ATLAS_HISTORY_ROUTE_IDENTITY=1.
 */
import { haversineDistance } from './utils.js';

/** Both ends within this distance (metres) count as the same termini. */
export const SAME_TERMINUS_M = 1500;

const FILLER = /\b(line|route|brt|rapid|express|bus|the|via|to|and|limited|ltd|local|crosstown|connector|shuttle)\b/g;

/** Lower case, no punctuation or filler words, so "Red Line BRT" and "Red Line" compare equal. */
export function normalizeRouteName(name: string | undefined | null): string {
  return (name ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(FILLER, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Words of one name also in the other, as a share of the shorter name's words. */
function nameOverlap(a: string, b: string): number {
  const wa = new Set(a.split(' ').filter(Boolean));
  const wb = new Set(b.split(' ').filter(Boolean));
  if (wa.size === 0 || wb.size === 0) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / Math.min(wa.size, wb.size);
}

/** [lon, lat] of a line's two ends. */
export type Termini = [[number, number], [number, number]];

export function terminiOf(line: number[][] | undefined | null): Termini | null {
  if (!line || line.length < 2) return null;
  const a = line[0];
  const b = line[line.length - 1];
  return [[a[0], a[1]], [b[0], b[1]]];
}

/** The larger end-to-end distance under the better of the two pairings (a line may be stored reversed). */
export function terminiDistanceM(x: Termini, y: Termini): number {
  const d = (p: [number, number], q: [number, number]) => haversineDistance(p[1], p[0], q[1], q[0]);
  const same = Math.max(d(x[0], y[0]), d(x[1], y[1]));
  const swapped = Math.max(d(x[0], y[1]), d(x[1], y[0]));
  return Math.min(same, swapped);
}

export interface IdentityPeriod {
  periodKey: string;
  /** Sortable date of the period (YYYYMMDD reference date or period key). */
  sortKey: string;
  year: number;
  name?: string;
  termini?: Termini | null;
}

export interface IdentityVerdict {
  same: boolean;
  reason: string;
  terminiM: number | null;
}

/** Is `next` the same route as `prev`? */
export function sameRouteIdentity(prev: IdentityPeriod, next: IdentityPeriod): IdentityVerdict {
  const a = normalizeRouteName(prev.name);
  const b = normalizeRouteName(next.name);
  const terminiM = prev.termini && next.termini ? Math.round(terminiDistanceM(prev.termini, next.termini)) : null;
  if (!a || !b) return { same: true, reason: 'no long name to compare', terminiM };
  if (a === b || nameOverlap(a, b) >= 0.5) return { same: true, reason: 'same long name', terminiM };
  if (terminiM != null && terminiM <= SAME_TERMINUS_M) return { same: true, reason: 'renamed, same termini', terminiM };
  return { same: false, reason: terminiM == null ? 'long name changed, no line to compare' : 'long name and termini changed', terminiM };
}

export interface IdentitySegment {
  periodKeys: string[];
  firstYear: number;
  lastYear: number;
  name?: string;
}

export interface IdentitySplit {
  fromYear: number;
  toYear: number;
  before: string;
  after: string;
  verdict: IdentityVerdict;
}

/** The route key's periods cut into same-route segments, oldest first, and the cut points. */
export function splitRouteHistory(periods: readonly IdentityPeriod[]): { segments: IdentitySegment[]; splits: IdentitySplit[] } {
  const sorted = [...periods].sort((x, y) => x.sortKey.localeCompare(y.sortKey));
  const segments: IdentitySegment[] = [];
  const splits: IdentitySplit[] = [];
  let prev = null as IdentityPeriod | null;
  for (const p of sorted) {
    const verdict = prev ? sameRouteIdentity(prev, p) : null;
    if (!prev || !verdict!.same) {
      if (prev && verdict) splits.push({ fromYear: prev.year, toYear: p.year, before: prev.name ?? '', after: p.name ?? '', verdict });
      segments.push({ periodKeys: [p.periodKey], firstYear: p.year, lastYear: p.year, name: p.name });
    } else {
      const seg = segments[segments.length - 1];
      seg.periodKeys.push(p.periodKey);
      seg.lastYear = p.year;
      seg.name = p.name ?? seg.name;
    }
    // Compare with the latest period that has a name, so one nameless period does not hide a change.
    const last: IdentityPeriod | null = prev;
    prev = p.name || !last ? p : { periodKey: last.periodKey, sortKey: last.sortKey, year: last.year, name: last.name, termini: p.termini ?? last.termini };
  }
  return { segments, splits };
}

/** The key an earlier segment is published under: the route number plus its first year. */
export function splitKey(routeKey: string, segment: IdentitySegment): string {
  return `${routeKey} (${segment.firstYear}${segment.lastYear !== segment.firstYear ? `-${segment.lastYear}` : ''})`;
}
