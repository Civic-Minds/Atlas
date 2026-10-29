/**
 * History v2: per-route representative weekday value, weekend days, flags, change
 * fingerprint and the immutable sidecar writer. Pure except for the sink.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { HeadwayByPeriod, PeriodKey } from '../shared/config.js';
import { NO_PERIOD_SERVICE_TILE_VALUE } from '../shared/pmtilesProps.js';
import {
  historyFlagFor,
  type HistoryRep,
  type HistoryV2Sidecar,
  type HistoryV2SidecarRoute,
} from '../shared/historyV2.js';
import { historyRouteKey } from './historyRouteKey.js';
import { positivelyNoService, weekendDay, type FeedEvidence } from './historyWeekend.js';

type Props = Record<string, unknown>;

export interface RepResult {
  rep: HistoryRep;
  /** Stamped features of the key disagreed on the all-day value (the worst was kept). */
  conflict: boolean;
}

function finiteOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v < NO_PERIOD_SERVICE_TILE_VALUE ? v : null;
}

function periodsOf(features: Props[]): HeadwayByPeriod | undefined {
  const out: Partial<Record<PeriodKey, number | null>> = {};
  let any = false;
  for (const f of features) {
    const src = (f.routeFilterHeadwayByPeriod ?? f.worstDirectionHeadwayByPeriod) as Record<string, unknown> | undefined;
    if (!src) continue;
    for (const [k, raw] of Object.entries(src)) {
      const v = finiteOrNull(raw);
      const cur = out[k as PeriodKey];
      // worst direction: keep the larger value across features
      if (cur === undefined || (v != null && (cur == null || v > cur))) out[k as PeriodKey] = v;
      any = true;
    }
  }
  return any ? out : undefined;
}

/**
 * CIV-555: a route's shared-stretch (trunk) value for History's "every 8–60" headline: each direction's best
 * minStopHeadway (the live card's trunk reading, headsignTrunkHeadway, reads the same field), then the worst
 * direction, as the frequency filter judges every direction. Null without the field.
 */
export function routeTrunkHeadway(features: Props[]): number | null {
  const byDirection = new Map<string, number>();
  for (const f of features) {
    const v = finiteOrNull(f.minStopHeadway);
    if (v == null) continue;
    const direction = String(f.directionId ?? 0);
    const best = byDirection.get(direction);
    if (best == null || v < best) byDirection.set(direction, v);
  }
  return byDirection.size > 0 ? Math.max(...byDirection.values()) : null;
}

/**
 * The same per period, from headsignMinStopHeadwayByPeriod (the field the live card's headsignTrunkHeadway reads for a
 * period), kept only where better than the route's own period value in `periods`. Undefined when none is.
 */
export function routeTrunkHeadwayByPeriod(features: Props[], periods: HeadwayByPeriod | undefined): HeadwayByPeriod | undefined {
  if (!periods) return undefined;
  const out: Partial<Record<PeriodKey, number | null>> = {};
  for (const [k, value] of Object.entries(periods) as Array<[PeriodKey, number | null | undefined]>) {
    if (value == null) continue;
    const t = routeTrunkHeadway(features.map(f => ({ directionId: f.directionId, minStopHeadway: (f.headsignMinStopHeadwayByPeriod as Record<string, unknown> | undefined)?.[k] })));
    if (t != null && t < value) out[k] = t;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * The representative weekday value of a route from its Weekday features: the route-level
 * stamp routeAllDayHeadway read as the map reads it (sentinel, or an all-span route, = limited).
 * No stamp = blank rep ({}): never a minimum across patterns or directions.
 */
export function representativeRep(features: Props[]): RepResult {
  const stamped = features.filter(f => f.routeAllDayHeadway != null && Number.isFinite(Number(f.routeAllDayHeadway)));
  if (stamped.length === 0) return { rep: {}, conflict: false };
  const values = stamped.map(f => Number(f.routeAllDayHeadway));
  const conflict = new Set(values).size > 1;
  const worst = Math.max(...values);
  const p = periodsOf(stamped);
  const allSpan = stamped.every(f => f.tier === 'span');
  if (worst >= NO_PERIOD_SERVICE_TILE_VALUE || allSpan) return { rep: { lim: true, ...(p ? { p } : {}) }, conflict };
  const t = routeTrunkHeadway(features);
  const tp = routeTrunkHeadwayByPeriod(features, p);
  return { rep: { h: worst, ...(p ? { p } : {}), ...(t != null && t < worst ? { t } : {}), ...(tp ? { tp } : {}) }, conflict };
}

export interface BuildV2Report {
  routes: number;
  blankWeekday: number;
  limited: number;
  stampConflicts: number;
  weekendNone: number;
}

export interface BuildV2Result {
  routes: Record<string, HistoryV2SidecarRoute>;
  report: BuildV2Report;
  /** Route keys whose stamped features disagreed on the all-day value. */
  conflictKeys?: string[];
}

/** All routes of one processed feed -> sidecar route records, keyed by historyRouteKey. */
export function buildV2Routes(features: Array<{ properties?: Props | null }>, evidence?: FeedEvidence): BuildV2Result {
  const byKey = new Map<string, { Weekday: Props[]; Saturday: Props[]; Sunday: Props[]; name?: string }>();
  for (const f of features) {
    const p = f.properties;
    if (!p) continue;
    const day = p.day;
    if (day !== 'Weekday' && day !== 'Saturday' && day !== 'Sunday') continue;
    const key = historyRouteKey(p, { longNameFallback: true });
    if (!key) continue;
    let entry = byKey.get(key);
    if (!entry) { entry = { Weekday: [], Saturday: [], Sunday: [] }; byKey.set(key, entry); }
    entry[day].push(p);
    const ln = typeof p.routeLongName === 'string' ? p.routeLongName.trim() : '';
    if (ln && !entry.name) entry.name = ln;
  }
  const routes: Record<string, HistoryV2SidecarRoute> = {};
  const report: BuildV2Report = { routes: 0, blankWeekday: 0, limited: 0, stampConflicts: 0, weekendNone: 0 };
  const conflictKeys: string[] = [];
  for (const [key, e] of [...byKey.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    // A route with no Weekday features has no weekday headline to anchor a snapshot on.
    if (e.Weekday.length === 0) continue;
    const { rep, conflict } = representativeRep(e.Weekday);
    const rec: HistoryV2SidecarRoute = { name: e.name ?? key, rep };
    for (const [field, day] of [['sat', 'Saturday'], ['sun', 'Sunday']] as const) {
      const v = weekendDay(e[day], evidence ? positivelyNoService(evidence, key, day) : false);
      if (v) { rec[field] = v; if ('none' in v) report.weekendNone++; }
    }
    const flag = historyFlagFor(rep);
    if (flag) rec.flag = flag;
    routes[key] = rec;
    report.routes++;
    if (rep.h == null && !rep.lim) report.blankWeekday++;
    if (rep.lim) report.limited++;
    if (conflict) { report.stampConflicts++; conflictKeys.push(key); }
  }
  return { routes, report, conflictKeys };
}

/** One processed feed's share of an agency's merged features, with that feed's own calendar evidence. */
export interface V2FeedPart {
  /** null = the agency's main feed; otherwise the supplemental feed url. */
  url: string | null;
  features: Array<{ properties?: Props | null }>;
  evidence?: FeedEvidence;
}

export interface V2Collision {
  key: string;
  /** The supplemental feed whose route was not used (the earlier feed's route is kept). */
  droppedFrom: string;
}

export interface MergedV2Result extends BuildV2Result {
  collisions: V2Collision[];
  /** Kept routes that came from a supplemental feed, by feed url. */
  supplementalRoutes: Record<string, string[]>;
}

/** Split the merged feature list back into per-feed parts using processAgencyFeeds' featureSources. */
export function splitFeaturesBySource<T>(features: T[], sources: Array<{ url: string | null; count: number }> | undefined): Array<{ url: string | null; features: T[] }> {
  if (!sources || sources.length === 0) return [{ url: null, features }];
  const out: Array<{ url: string | null; features: T[] }> = [];
  let at = 0;
  for (const { url, count } of sources) { out.push({ url, features: features.slice(at, at + count) }); at += count; }
  if (at !== features.length) throw new Error(`featureSources cover ${at} of ${features.length} features`);
  return out;
}

/**
 * Routes of the main feed plus its supplemental feeds. Each feed is built with its own
 * evidence (weekend "none" is only proven by the feed that runs the route). A key already
 * taken by an earlier feed is never overwritten: the earlier route is kept and the clash is
 * returned as a collision. One part gives exactly buildV2Routes' result.
 */
export function buildV2RoutesMerged(parts: V2FeedPart[]): MergedV2Result {
  const built = parts.map(p => ({ url: p.url, ...buildV2Routes(p.features, p.evidence) }));
  if (built.length === 1) return { routes: built[0].routes, report: built[0].report, conflictKeys: built[0].conflictKeys, collisions: [], supplementalRoutes: {} };
  const routes: Record<string, HistoryV2SidecarRoute> = {};
  const collisions: V2Collision[] = [];
  const supplementalRoutes: Record<string, string[]> = {};
  const report: BuildV2Report = { routes: 0, blankWeekday: 0, limited: 0, stampConflicts: 0, weekendNone: 0 };
  for (const b of built) {
    const conflicts = new Set(b.conflictKeys ?? []);
    for (const [key, rec] of Object.entries(b.routes)) {
      if (routes[key]) { collisions.push({ key, droppedFrom: b.url ?? 'main' }); continue; }
      routes[key] = rec;
      if (b.url) (supplementalRoutes[b.url] ??= []).push(key);
      report.routes++;
      if (rec.rep.h == null && !rec.rep.lim) report.blankWeekday++;
      if (rec.rep.lim) report.limited++;
      if (conflicts.has(key)) report.stampConflicts++;
      for (const d of [rec.sat, rec.sun]) if (d && 'none' in d) report.weekendNone++;
    }
  }
  return { routes, report, collisions, supplementalRoutes };
}

export function buildSidecar(
  slug: string, periodKey: string, refDate: string, routes: Record<string, HistoryV2SidecarRoute>,
  supplementalRoutes?: Record<string, string[]>,
): HistoryV2Sidecar {
  const sc: HistoryV2Sidecar = { version: 2, slug, periodKey, refDate, routes };
  if (supplementalRoutes && Object.keys(supplementalRoutes).length > 0) sc.supplementalRoutes = supplementalRoutes;
  return sc;
}

/** History v2 is an explicit opt-in: only ATLAS_HISTORY_V2=1 turns it on (see historyV2Flag.ts). */
export { historyV2Enabled } from './historyV2Flag.js';

export const BUS_ONLY_NOTE = 'bus feed only; supplemental routes excluded';

export interface BackfillSupplementalPolicy {
  busOnly: boolean;
  supplementalExcluded: string[];
  note?: string;
}

/**
 * A backfill rebuilds from the main feed's archive only (supplemental feeds have no archive).
 * An agency with supplemental feeds is refused unless --bus-only is passed, and then the
 * run is stamped so nothing reads it as complete.
 */
export function backfillSupplementalPolicy(slug: string, supplementalFeedUrls: string[] | undefined, busOnlyFlag: boolean): BackfillSupplementalPolicy {
  const urls = supplementalFeedUrls ?? [];
  if (urls.length === 0) return { busOnly: false, supplementalExcluded: [] };
  if (!busOnlyFlag) throw new Error(`${slug} has supplemental feeds (${urls.join(', ')}); pass --bus-only to backfill the main feed only (supplemental routes excluded)`);
  return { busOnly: true, supplementalExcluded: urls, note: BUS_ONLY_NOTE };
}

// ---- change detection ----------------------------------------------------

export type Headline = number | 'lim' | 'none' | undefined;
export interface HistoryFingerprint { wk?: Headline; sat?: Headline; sun?: Headline }

function headlineOf(v: { h?: number; lim?: true; none?: true } | undefined): Headline {
  if (!v) return undefined;
  if (v.none) return 'none';
  if (v.lim) return 'lim';
  return v.h;
}

export function fingerprintOf(rec: HistoryV2SidecarRoute): HistoryFingerprint {
  return { wk: headlineOf(rec.rep), sat: headlineOf(rec.sat), sun: headlineOf(rec.sun) };
}

/**
 * Unknown is a wildcard: a previous entry without a day (or an old-format baseline, which
 * is read as all-unknown) never counts as a change against a new value.
 */
export function fingerprintChanged(prev: HistoryFingerprint | undefined, next: HistoryFingerprint): boolean {
  if (!prev) return false;
  return (['wk', 'sat', 'sun'] as const).some(k => prev[k] !== undefined && next[k] !== undefined && prev[k] !== next[k]);
}

/** latest.json route entry; the marker `v: 2` says the fingerprint fields were written by v2. */
export interface LatestRouteEntry { headway?: number; v?: number; wk?: Headline; sat?: Headline; sun?: Headline }

export function baselineFingerprint(entry: LatestRouteEntry | undefined): HistoryFingerprint | undefined {
  if (!entry) return undefined;
  if (entry.v !== 2) return {}; // old baseline (a pattern minimum): all unknown, never a change
  return { wk: entry.wk, sat: entry.sat, sun: entry.sun };
}

// ---- sinks (local first; R2 is an explicit opt-in never used by default) -----

export type PutResult = 'written' | 'unchanged' | 'conflict';

export interface HistoryV2Sink {
  /** Sidecars are immutable: identical content is a no-op, different content is a conflict. */
  put(key: string, body: string): Promise<PutResult>;
}

export function localDirSink(dir: string, opts: { overwrite?: boolean } = {}): HistoryV2Sink {
  const root = resolve(dir);
  return {
    async put(key, body) {
      const path = resolve(root, key);
      if (!path.startsWith(root + '/')) throw new Error(`refusing to write outside ${root}: ${key}`);
      if (existsSync(path)) {
        if (readFileSync(path, 'utf8') === body) return 'unchanged';
        if (!opts.overwrite) return 'conflict';
      }
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, body);
      return 'written';
    },
  };
}

/** Opt-in R2 archive sink. Nothing in this task constructs it. */
export async function r2ArchiveSink(): Promise<HistoryV2Sink> {
  const r2 = await import('./r2.js');
  return {
    async put(key, body) {
      const existing = await r2.r2GetArchive(key);
      if (existing != null) return existing === body ? 'unchanged' : 'conflict';
      await r2.r2PutArchiveJson(key, body);
      return 'written';
    },
  };
}

export function sidecarKey(slug: string, periodKey: string): string {
  return `history-v2/${slug}/${periodKey}.json`;
}

export async function writeSidecar(sink: HistoryV2Sink, sidecar: HistoryV2Sidecar): Promise<PutResult> {
  return sink.put(sidecarKey(sidecar.slug, sidecar.periodKey), JSON.stringify(sidecar));
}

/**
 * Period key for an archived zip: its file stem when that is already a date key (archived
 * zips are named by feed end date), else the feed's own end date, version, then the stem.
 */
export function periodKeyForZip(stem: string, dates: { feedInfoEnd?: string | null; feedExpiry?: string | null; feedVersion?: string | null }): string {
  if (/^\d{8}$/.test(stem) || /^\d{4}-\d{2}-\d{2}$/.test(stem)) return stem;
  return dates.feedInfoEnd || dates.feedExpiry || dates.feedVersion || stem;
}
