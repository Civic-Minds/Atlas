/**
 * Which agencies Studio's Live page offers (CIV-1828): the agencies with a route analysis that covers enough days of
 * recordings, decided by the analysis files themselves, never by a date or a typed list. A new agency (Kingston) joins
 * the menu once its files are built (npm run studio:report) and reach the minimum. The dev server scans the folder and
 * answers at LIVE_STUDIO_AGENCIES_URL (local-api/live-studio-agencies.ts); this file holds the pure rules.
 */
import { LIVE_MIN_GOOD_DAYS, LIVE_STUDIO_MIN_RECORDED_DAYS } from './rules/live.js';

/** Where the dev server lists the agencies Studio's Live page offers: `{ agencies: string[] }`. */
export const LIVE_STUDIO_AGENCIES_URL = '/api/live-studio-agencies';

/** The agency listed first. */
const FIRST = 'ttc';

/** One route analysis file as the scan saw it. */
export interface LiveRouteFile {
  slug: string;
  route: string;
  /** Days of recordings the analysis covers (its `dates`). */
  days: number;
  /** Held back from Live (by hand or by the quality checks): it never makes an agency qualify. */
  held: boolean;
}

/** The minimum days of recordings: 7 for Studio, the shortest section minimum on the dev server (internal). */
export function liveStudioMinDays(internal: boolean): number {
  return internal ? LIVE_MIN_GOOD_DAYS : LIVE_STUDIO_MIN_RECORDED_DAYS;
}

const SEGMENTS_FILE = /^([a-z0-9]+(?:-[a-z0-9]+)*?)-([A-Za-z0-9]+)-segments\.json$/;

/** "kingston-12-segments.json" → { slug: 'kingston', route: '12' }; null for any other file name. */
export function parseSegmentsFileName(name: string): { slug: string; route: string } | null {
  const m = SEGMENTS_FILE.exec(name);
  return m ? { slug: m[1], route: m[2] } : null;
}

/** The agencies with at least one route that is not held and covers `minDays` days or more: TTC first, then by slug. */
export function liveStudioAgencies(files: readonly LiveRouteFile[], minDays: number): string[] {
  const slugs = new Set(files.filter(f => !f.held && f.days >= minDays).map(f => f.slug));
  return [...slugs].sort((a, b) => (a === FIRST ? -1 : b === FIRST ? 1 : a.localeCompare(b)));
}
