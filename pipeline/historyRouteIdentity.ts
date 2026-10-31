/**
 * History route identity (CIV-422): tell a reused route number apart from the same route. A route key's periods are
 * read in date order; the number became a different route when its long name changed AND little of today's line ran
 * before (sameRouteIdentity). An earlier route is then published under its own key, "<number> (<years>)".
 * Pure; build-history applies it behind ATLAS_HISTORY_ROUTE_IDENTITY=1 until Ryan says yes to rebuilding History.
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
  /** The route's line in the period ([lon, lat]); the stops sit on it, so it carries the mid-trip stops too. */
  line?: number[][] | null;
}

/** A point of one line within this distance (metres) of the other line counts as on it. */
export const SAME_PATH_M = 200;

/** Metres between two [lon, lat] points (equirectangular: fine at a few hundred metres). */
function metres(a: number[], b: number[]): number {
  const k = Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180);
  return Math.hypot((a[0] - b[0]) * k, a[1] - b[1]) * 111_320;
}

function toSegmentM(p: number[], a: number[], b: number[]): number {
  const k = Math.cos(p[1] * Math.PI / 180);
  const [ax, ay, bx, by, px, py] = [a[0] * k, a[1], b[0] * k, b[1], p[0] * k, p[1]];
  const dx = bx - ax, dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) * 111_320;
}

/** Points every `stepM` metres along a line, ends included. */
function sampleLine(line: number[][], stepM = 50): number[][] {
  const out: number[][] = [line[0]];
  for (let i = 1; i < line.length; i++) {
    const d = metres(line[i - 1], line[i]);
    for (let s = stepM; s < d; s += stepM) {
      const t = s / d;
      out.push([line[i - 1][0] + t * (line[i][0] - line[i - 1][0]), line[i - 1][1] + t * (line[i][1] - line[i - 1][1])]);
    }
    out.push(line[i]);
  }
  return out;
}

/** The share of line `a`'s length that runs within SAME_PATH_M of line `b`. */
export function pathShareOn(a: number[][], b: number[][]): number {
  const pts = sampleLine(a);
  let on = 0;
  for (const p of pts) {
    for (let i = 1; i < b.length; i++) if (toSegmentM(p, b[i - 1], b[i]) <= SAME_PATH_M) { on++; break; }
  }
  return pts.length ? on / pts.length : 0;
}

export interface IdentityVerdict {
  same: boolean;
  reason: string;
  terminiM: number | null;
  /** The share of today's line that ran before (see sameRouteIdentity), when both sides have a line. */
  shared?: number | null;
}

/** Same route when at least this share of today's line ran before (see sameRouteIdentity). Every rename in the MBTA and
 *  IndyGo archives is 94% or more except the three reuses (22%, 65%, 67%), so any cutoff from 70% to 90% splits the same. */
export const SAME_ROUTE_SHARE = 0.8;

/** The long name, or '' when there is none or it is only the route number (MBTA before 2018: "21"). */
function realName(routeKey: string | undefined, name: string | undefined): string {
  const n = normalizeRouteName(name);
  return n && n !== normalizeRouteName(routeKey) ? n : '';
}

/**
 * Is `next` the same route as the segment ending in `prev` (CIV-422; Ryan: "Why not look at mid-trip stops too?", then
 * his pick of the one-way measure, 2026-10-29)? A number is reused only when BOTH the long name changes AND less than
 * SAME_ROUTE_SHARE of today's line ran before: the share of the new line within SAME_PATH_M of any of the segment's
 * earlier lines. The path is the whole line, so the stops along the trip count. A cut-back or a rename on the same
 * streets stays one route; a renamed route that grew onto streets it never served splits (MBTA 85 in 2026: only 22% of
 * the new line ran before). A name that is only the route number is no name. With no line on either side, the
 * long-name/terminus rule decides.
 */
export function sameRouteIdentity(prev: IdentityPeriod, next: IdentityPeriod, segmentLines: ReadonlyArray<number[][]> = [], routeKey?: string): IdentityVerdict {
  const terminiM = prev.termini && next.termini ? Math.round(terminiDistanceM(prev.termini, next.termini)) : null;
  const lines = [...segmentLines, ...(prev.line ? [prev.line] : [])];
  if (!next.line || next.line.length < 2 || lines.length === 0) return sameRouteIdentityByName(prev, next);
  let shared = 0;
  for (const l of lines) if (l.length >= 2) shared = Math.max(shared, pathShareOn(next.line, l));
  const a = realName(routeKey, prev.name), b = realName(routeKey, next.name);
  const renamed = !!a && !!b && a !== b && nameOverlap(a, b) < 0.5;
  const pct = `${Math.round(shared * 100)}% of today's line ran before`;
  if (!renamed) return { same: true, reason: `same long name (${pct})`, terminiM, shared };
  return shared >= SAME_ROUTE_SHARE
    ? { same: true, reason: `renamed, ${pct}`, terminiM, shared }
    : { same: false, reason: `renamed and only ${pct}`, terminiM, shared };
}

/** Without a line to compare: long name and terminus. */
export function sameRouteIdentityByName(prev: IdentityPeriod, next: IdentityPeriod): IdentityVerdict {
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
export function splitRouteHistory(periods: readonly IdentityPeriod[], routeKey?: string): { segments: IdentitySegment[]; splits: IdentitySplit[] } {
  const sorted = [...periods].sort((x, y) => x.sortKey.localeCompare(y.sortKey));
  const segments: IdentitySegment[] = [];
  const splits: IdentitySplit[] = [];
  let prev = null as IdentityPeriod | null;
  // Every line of the current segment: a year's stored line may be another pattern of the same route.
  let segLines: number[][][] = [];
  for (const p of sorted) {
    const verdict = prev ? sameRouteIdentity(prev, p, segLines, routeKey) : null;
    if (!prev || !verdict!.same) {
      if (prev && verdict) splits.push({ fromYear: prev.year, toYear: p.year, before: prev.name ?? '', after: p.name ?? '', verdict });
      segments.push({ periodKeys: [p.periodKey], firstYear: p.year, lastYear: p.year, name: p.name });
      segLines = [];
    } else {
      const seg = segments[segments.length - 1];
      seg.periodKeys.push(p.periodKey);
      seg.lastYear = p.year;
      seg.name = p.name ?? seg.name;
    }
    if (p.line && p.line.length >= 2) segLines.push(p.line);
    // Compare with the latest period that has a name, so one nameless period does not hide a change.
    const last: IdentityPeriod | null = prev;
    prev = p.name || !last ? p : { periodKey: last.periodKey, sortKey: last.sortKey, year: last.year, name: last.name, termini: p.termini ?? last.termini, line: p.line ?? last.line };
  }
  return { segments, splits };
}

/** The key an earlier segment is published under: the route number plus its first year. */
export function splitKey(routeKey: string, segment: IdentitySegment): string {
  return `${routeKey} (${segment.firstYear}${segment.lastYear !== segment.firstYear ? `-${segment.lastYear}` : ''})`;
}
