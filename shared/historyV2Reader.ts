/**
 * History v2 reader (pure: no DOM, no network). Contract: docs/data/DATA_HISTORY.md, "History v2 reader contract".
 *
 * What it does
 *  - parseHistoryV2Sidecar: validates one sidecar history-v2/{slug}/{periodKey}.json (all routes of one agency period).
 *  - parseHistoryAgencyV2: validates the agency-level file (the build output: { slug, routes: [{ snapshots }] }),
 *    which is also the shape of one entry of history-config.json.
 *  - selectors the UI uses: routesForYear, yearsAvailable, snapshotValue, snapshotFlag.
 *
 * Rules the UI must keep
 *  - Blank is blank: a missing weekend value means "unknown". Never show it as 0 and never fill it in.
 *  - {none:true} means the feed positively has no service that day. It is not blank and not 0.
 *  - Flags (fast / slow / limited) are stored, never hidden. The UI decides how to word them.
 *  - Old v1 snapshots (no `v2`) are fine: weekday is weekdayHeadwayMin, weekend is blank.
 *
 * Forward compatible: unknown extra fields are ignored and kept as they are. Validation never throws;
 * it returns a typed error. A newer sidecar `version` is reported as 'unsupported-version', not guessed at.
 */
import type { HistoryDayValue, HistoryFlag, HistoryRep, HistorySnapshotV2, HistoryV2Sidecar } from './historyV2.js';
import { yearOfRefDate } from './historyV2.js';

export type { HistoryDayValue, HistoryFlag, HistoryRep, HistorySnapshotV2, HistoryV2Sidecar };

export type HistoryV2ErrorCode =
  | 'not-object'
  | 'unsupported-version'
  | 'missing-field'
  | 'bad-field';

export interface HistoryV2Error {
  code: HistoryV2ErrorCode;
  /** Where it went wrong, e.g. `routes.12.sat`. */
  path: string;
  message: string;
}

export type HistoryV2Result<T> = { ok: true; value: T } | { ok: false; error: HistoryV2Error };

export type HistoryDay = 'weekday' | 'sat' | 'sun';

/** What a snapshot says about one day. `blank` = unknown (never 0); `none` = the feed has no service. */
export type SnapshotValue =
  | { kind: 'value'; min: number }
  | { kind: 'limited' }
  | { kind: 'none' }
  | { kind: 'blank' };

/** The least a snapshot needs (the UI's RouteSnapshot satisfies this). */
export interface HistorySnapshotLike {
  label: string;
  year: number;
  weekdayHeadwayMin: number;
  periodKey?: string;
  v2?: HistorySnapshotV2;
}

export interface HistoryRouteLike<S extends HistorySnapshotLike = HistorySnapshotLike> {
  routeShortName: string;
  routeName?: string;
  snapshots: S[];
}

export interface HistoryAgencyLike<S extends HistorySnapshotLike = HistorySnapshotLike> {
  slug: string;
  routes: Array<HistoryRouteLike<S>>;
}

const fail = (code: HistoryV2ErrorCode, path: string, message: string): { ok: false; error: HistoryV2Error } =>
  ({ ok: false, error: { code, path, message } });

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isMinutes = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const isRefDate = (v: unknown): v is string => typeof v === 'string' && yearOfRefDate(v) != null;
const FLAGS: readonly string[] = ['fast', 'slow', 'limited'];

function checkRep(v: unknown, path: string): HistoryV2Error | null {
  if (!isObj(v)) return { code: 'missing-field', path, message: 'rep must be an object' };
  if (v.h !== undefined && !isMinutes(v.h)) return { code: 'bad-field', path: `${path}.h`, message: 'h must be a positive number of minutes' };
  if (v.lim !== undefined && v.lim !== true) return { code: 'bad-field', path: `${path}.lim`, message: 'lim must be true when present' };
  if (v.h !== undefined && v.lim !== undefined) return { code: 'bad-field', path, message: 'rep cannot have both h and lim' };
  if (v.p !== undefined && !isObj(v.p)) return { code: 'bad-field', path: `${path}.p`, message: 'p must be an object' };
  return null;
}

function checkDay(v: unknown, path: string): HistoryV2Error | null {
  if (v === undefined) return null; // absent = blank
  if (!isObj(v)) return { code: 'bad-field', path, message: 'day value must be an object' };
  if (v.none !== undefined) {
    return v.none === true && v.h === undefined && v.lim === undefined ? null
      : { code: 'bad-field', path, message: 'none must be exactly {none:true}' };
  }
  if (v.lim !== undefined) {
    return v.lim === true && v.h === undefined ? null : { code: 'bad-field', path, message: 'lim must be exactly {lim:true}' };
  }
  return isMinutes(v.h) ? null : { code: 'bad-field', path, message: 'day value needs h > 0, lim:true or none:true' };
}

function checkFlag(v: unknown, path: string): HistoryV2Error | null {
  return v === undefined || (typeof v === 'string' && FLAGS.includes(v)) ? null
    : { code: 'bad-field', path, message: 'flag must be fast, slow or limited' };
}

/** Validate one sidecar object (history-v2/{slug}/{periodKey}.json). Never throws. */
export function parseHistoryV2Sidecar(input: unknown): HistoryV2Result<HistoryV2Sidecar> {
  if (!isObj(input)) return fail('not-object', '', 'sidecar must be a JSON object');
  if (input.version === undefined) return fail('missing-field', 'version', 'version is required');
  if (input.version !== 2) return fail('unsupported-version', 'version', `unsupported sidecar version ${String(input.version)}`);
  if (typeof input.slug !== 'string' || !input.slug) return fail('missing-field', 'slug', 'slug is required');
  if (typeof input.periodKey !== 'string' || !input.periodKey) return fail('missing-field', 'periodKey', 'periodKey is required');
  if (!isRefDate(input.refDate)) return fail('bad-field', 'refDate', 'refDate must be a real YYYYMMDD date string');
  if (!isObj(input.routes)) return fail('missing-field', 'routes', 'routes must be an object');
  for (const [key, route] of Object.entries(input.routes)) {
    const base = `routes.${key}`;
    if (!isObj(route)) return fail('bad-field', base, 'route must be an object');
    const err = checkRep(route.rep, `${base}.rep`) ?? checkDay(route.sat, `${base}.sat`) ?? checkDay(route.sun, `${base}.sun`) ?? checkFlag(route.flag, `${base}.flag`);
    if (err) return { ok: false, error: err };
  }
  return { ok: true, value: input as unknown as HistoryV2Sidecar };
}

function checkSnapshotV2(v: unknown, path: string): HistoryV2Error | null {
  if (!isObj(v)) return { code: 'bad-field', path, message: 'v2 must be an object' };
  if (!isRefDate(v.refDate)) return { code: 'bad-field', path: `${path}.refDate`, message: 'refDate must be a real YYYYMMDD date string' };
  if (typeof v.key !== 'string') return { code: 'missing-field', path: `${path}.key`, message: 'key is required' };
  return checkRep(v.rep, `${path}.rep`) ?? checkDay(v.sat, `${path}.sat`) ?? checkDay(v.sun, `${path}.sun`) ?? checkFlag(v.flag, `${path}.flag`);
}

/**
 * Validate an agency-level history object: `{ slug, routes: [{ routeShortName, snapshots: [...] }] }`.
 * Snapshots may be v1 (no `v2`) or v2. Extra fields (geometry, headwayByPeriod, name, ...) are kept untouched.
 */
export function parseHistoryAgencyV2<S extends HistorySnapshotLike = HistorySnapshotLike>(input: unknown): HistoryV2Result<HistoryAgencyLike<S>> {
  if (!isObj(input)) return fail('not-object', '', 'agency history must be a JSON object');
  if (typeof input.slug !== 'string' || !input.slug) return fail('missing-field', 'slug', 'slug is required');
  if (!Array.isArray(input.routes)) return fail('missing-field', 'routes', 'routes must be an array');
  for (let i = 0; i < input.routes.length; i++) {
    const route: unknown = input.routes[i];
    const rp = `routes.${i}`;
    if (!isObj(route)) return fail('bad-field', rp, 'route must be an object');
    if (typeof route.routeShortName !== 'string') return fail('missing-field', `${rp}.routeShortName`, 'routeShortName is required');
    if (!Array.isArray(route.snapshots)) return fail('missing-field', `${rp}.snapshots`, 'snapshots must be an array');
    for (let j = 0; j < route.snapshots.length; j++) {
      const snap: unknown = route.snapshots[j];
      const sp = `${rp}.snapshots.${j}`;
      if (!isObj(snap)) return fail('bad-field', sp, 'snapshot must be an object');
      if (typeof snap.label !== 'string') return fail('missing-field', `${sp}.label`, 'label is required');
      if (typeof snap.year !== 'number' || !Number.isInteger(snap.year)) return fail('bad-field', `${sp}.year`, 'year must be an integer');
      // Old v1 weekday value; a v2 snapshot's own rep is authoritative, so this may be anything numeric there.
      if (snap.v2 === undefined && !isMinutes(snap.weekdayHeadwayMin)) return fail('bad-field', `${sp}.weekdayHeadwayMin`, 'weekdayHeadwayMin must be a positive number');
      if (snap.v2 !== undefined) {
        const err = checkSnapshotV2(snap.v2, `${sp}.v2`);
        if (err) return { ok: false, error: err };
      }
    }
  }
  return { ok: true, value: input as unknown as HistoryAgencyLike<S> };
}

function dayValue(d: HistoryDayValue | undefined): SnapshotValue {
  if (!d) return { kind: 'blank' };
  if ('none' in d && d.none) return { kind: 'none' };
  if ('lim' in d && d.lim) return { kind: 'limited' };
  if ('h' in d && isMinutes(d.h)) return { kind: 'value', min: d.h };
  return { kind: 'blank' };
}

/**
 * One day's value for a snapshot. Blank (unknown) is never turned into 0.
 * v2 weekday = rep.h (min) or rep.lim (limited); no number and no lim = blank.
 * v1 snapshot: weekday = weekdayHeadwayMin, weekend = blank.
 */
export function snapshotValue(snapshot: HistorySnapshotLike, day: HistoryDay): SnapshotValue {
  const v2 = snapshot.v2;
  if (!v2) {
    if (day !== 'weekday') return { kind: 'blank' };
    return isMinutes(snapshot.weekdayHeadwayMin) ? { kind: 'value', min: snapshot.weekdayHeadwayMin } : { kind: 'blank' };
  }
  if (day === 'weekday') {
    if (v2.rep?.lim) return { kind: 'limited' };
    return isMinutes(v2.rep?.h) ? { kind: 'value', min: v2.rep.h } : { kind: 'blank' };
  }
  return dayValue(day === 'sat' ? v2.sat : v2.sun);
}

/** The stored flag (fast / slow / limited), or undefined. v1 snapshots have none. */
export function snapshotFlag(snapshot: HistorySnapshotLike): HistoryFlag | undefined {
  return snapshot.v2?.flag;
}

/** The real service day (YYYYMMDD) of a v2 snapshot; undefined for v1. */
export function snapshotRefDate(snapshot: HistorySnapshotLike): string | undefined {
  return snapshot.v2?.refDate;
}

export interface YearRoute<S extends HistorySnapshotLike, R extends HistoryRouteLike<S>> {
  route: R;
  snapshot: S;
  /** Period the kept snapshot came from (undefined for old data without one). */
  periodKey?: string;
  /** Real service day, YYYYMMDD (v2 only). */
  refDate?: string;
}

/** Sort key: real date when known, else the period key, so a stray duplicate resolves to the latest. */
const rank = (s: HistorySnapshotLike): string => s.v2?.refDate ?? s.periodKey ?? '';

/**
 * The routes that have a kept snapshot in `year`, each with that one snapshot. The map shows
 * only these routes for that year: a route with no snapshot in the year is not in the list
 * (absent, not zero). The build keeps one snapshot per route per year; if data ever carries two,
 * the one with the latest refDate (then period key) wins. Route order is the agency's order.
 */
export function routesForYear<S extends HistorySnapshotLike, R extends HistoryRouteLike<S>>(
  agency: { routes: R[] },
  year: number,
): Array<YearRoute<S, R>> {
  const out: Array<YearRoute<S, R>> = [];
  for (const route of agency.routes) {
    let best: S | undefined;
    for (const s of route.snapshots) {
      if (s.year !== year) continue;
      if (!best || rank(s) >= rank(best)) best = s;
    }
    if (best) out.push({ route, snapshot: best, periodKey: best.periodKey, refDate: best.v2?.refDate });
  }
  return out;
}

/** Years with at least one kept snapshot, ascending. */
export function yearsAvailable(agency: { routes: Array<{ snapshots: Array<{ year: number }> }> }): number[] {
  const years = new Set<number>();
  for (const r of agency.routes) for (const s of r.snapshots) years.add(s.year);
  return [...years].sort((a, b) => a - b);
}

/** Dev-only base-URL override for local fixtures (see the contract). Ignored in every built site. */
const devBase: unknown =
  typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, unknown> })?.env?.DEV
    ? (import.meta as { env?: Record<string, unknown> }).env?.VITE_HISTORY_V2_BASE
    : undefined;
export const HISTORY_V2_BASE_OVERRIDE: string | undefined =
  typeof devBase === 'string' && devBase ? devBase.replace(/\/$/, '') : undefined;

/** URLs under a base (fixtures: tmp/dev-history-v2 served at /dev-history-v2). */
export const historyV2AgencyUrl = (base: string, slug: string): string => `${base}/${slug}-v2-agency.json`;
export const historyV2SidecarUrl = (base: string, slug: string, periodKey: string): string => `${base}/history-v2/${slug}/${periodKey}.json`;
