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
  type HistoryDayValue,
  type HistoryRep,
  type HistoryV2Sidecar,
  type HistoryV2SidecarRoute,
} from '../shared/historyV2.js';
import { normalizeRouteFilterFeatures } from '../shared/routeHeadwayFilter.js';
import type { ShapeProperties, TimePeriod } from '../src/hooks/useIntervalStats.js';
import { routeListLowEnd } from '../src/utils/effectiveHeadway.js';
import { historyRouteKey } from './historyRouteKey.js';
import { positivelyNoService, weekendDay, type FeedEvidence } from './historyWeekend.js';
import { periodsOf } from './historyRoutePeriods.js';
import { normalizeRouteName } from './historyRouteIdentity.js';

type Props = Record<string, unknown>;

export interface RepResult {
  rep: HistoryRep;
  /** Stamped features of the key disagreed on the all-day value (the worst was kept). */
  conflict: boolean;
}

/**
 * CIV-555, #1248: the low end of History's "every 20–30", read as the live route list reads it (routeListLowEnd, the
 * lowest number the route card shows, #1231), so History and the list never give the route two low ends. Stored before the
 * range rule (headwayRangeShown), which History applies when it shows a row, as the list does (CIV-1227). Read on copies made the way the app loads an agency (normalizeRouteFilterFeatures), never on the features being written.
 */
function listLowEnd(features: Props[], period: TimePeriod): number | null {
  if (features.length === 0) return null;
  const copies = features.map(f => ({ properties: { ...f } }));
  normalizeRouteFilterFeatures(copies);
  const low = routeListLowEnd(copies.map(c => c.properties) as unknown as ShapeProperties[], period);
  return low != null && Number.isFinite(low) ? low : null;
}

/**
 * The route's all-day low end (the list's "All day" range, before the range rule). Null when the list has no lower number.
 * Not the map's trunk value (routeTrunkHeadwayByPeriod / tv_, CIV-1579): this is History's own range low end.
 */
export function historyListLowEnd(features: Props[]): number | null {
  return listLowEnd(features, 'all');
}

/**
 * The same per period, kept only where better than the route's own period value in `periods`. Undefined when none is.
 */
export function historyListLowEndByPeriod(features: Props[], periods: HeadwayByPeriod | undefined): HeadwayByPeriod | undefined {
  if (!periods) return undefined;
  const out: Partial<Record<PeriodKey, number | null>> = {};
  for (const [k, value] of Object.entries(periods) as Array<[PeriodKey, number | null | undefined]>) {
    if (value == null) continue;
    const t = listLowEnd(features, k);
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
  const t = historyListLowEnd(features);
  const tp = historyListLowEndByPeriod(features, p);
  return { rep: { h: worst, ...(p ? { p } : {}), ...(t != null && t < worst ? { t } : {}), ...(tp ? { tp } : {}) }, conflict };
}

/**
 * CIV-1431: a weekend day's shared-stretch values, worked out the same way as the weekday's (representativeRep):
 * `t` is the day's all-day low end when better than its h, `tp` the per-period low ends where better than its `p`.
 * Only a day with a number gets them; limited, none and unknown are returned unchanged.
 */
export function weekendTrunk(day: HistoryDayValue, features: Props[]): HistoryDayValue {
  if (!('h' in day)) return day;
  const t = historyListLowEnd(features);
  const tp = historyListLowEndByPeriod(features, day.p);
  return { ...day, ...(t != null && t < day.h ? { t } : {}), ...(tp ? { tp } : {}) };
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
export interface BuildV2Options {
  /** CIV-1425: also store Saturday/Sunday per-period values (`p`). Off = the output is unchanged. */
  weekendPeriods?: boolean;
  /**
   * CIV-1485 (the agency's historyNameFromDesc): a route with no long name of its own, or one that is only its number,
   * stores the feed's route_desc as `desc` (from evidence.descByKey, read with EvidenceOptions.routeDesc), unless the
   * description too is only the number ("Route 7"). Off = the output is unchanged.
   */
  nameFromDesc?: boolean;
}

/** CIV-1485: the route_desc to store for `key`, or undefined (see BuildV2Options.nameFromDesc). */
export function descForKey(key: string, longName: string | undefined, evidence: FeedEvidence | undefined): string | undefined {
  const own = normalizeRouteName(longName);
  if (own && own !== normalizeRouteName(key)) return undefined;
  const desc = evidence?.descByKey?.get(key);
  const n = normalizeRouteName(desc);
  return desc && n && n !== normalizeRouteName(key) ? desc : undefined;
}

export function buildV2Routes(features: Array<{ properties?: Props | null }>, evidence?: FeedEvidence, opts: BuildV2Options = {}): BuildV2Result {
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
    if (opts.nameFromDesc) {
      const desc = descForKey(key, e.name, evidence);
      if (desc) rec.desc = desc;
    }
    for (const [field, day] of [['sat', 'Saturday'], ['sun', 'Sunday']] as const) {
      const day0 = weekendDay(e[day], evidence ? positivelyNoService(evidence, key, day) : false, { periods: opts.weekendPeriods });
      // CIV-1431: the day's shared-stretch values, with its per-period values (same switch, so it is off by default).
      const v = day0 && opts.weekendPeriods ? weekendTrunk(day0, e[day]) : day0;
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
export function buildV2RoutesMerged(parts: V2FeedPart[], opts: BuildV2Options = {}): MergedV2Result {
  const built = parts.map(p => ({ url: p.url, ...buildV2Routes(p.features, p.evidence, opts) }));
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
  /** CIV-1484: the archive directory of each supplemental feed, by url, when the run includes them. */
  supplementalDirs: Record<string, string>;
}

/**
 * A backfill rebuilds from archived zips. An agency with supplemental feeds (e.g. rail) needs an
 * archive for every one of them: `--supplemental-zip-dir <url>=<dir>` per feed (or a bare `<dir>`
 * when the agency has exactly one), whose zips are named like the main feed's (one {stem}.zip per
 * period). Without them the run is refused unless --bus-only is passed, and then it is stamped so
 * nothing reads it as complete. Both at once, a dir for an unknown url, or a missing feed are refused.
 */
/**
 * CIV-1484: `--supplemental-id-prefix <prefix>` (or `<url>=<prefix>`) for a backfill run only. An older archived
 * period can reuse an id of the main feed (SEPTA's 2017 rail and bus feeds share two shape ids), which
 * processAgencyFeeds refuses; the prefix keeps the feeds apart for this run without changing the agency's config
 * (and so its live artifacts). History keys come from short names, so a prefixed route id only matters for a route
 * with no short name. A configured prefix wins; a different one given here is refused.
 */
export function backfillSupplementalIdPrefixes(slug: string, supplementalFeedUrls: string[] | undefined, configured: Record<string, string> | undefined, prefixArgs: readonly string[]): Record<string, string> | undefined {
  if (prefixArgs.length === 0) return configured;
  const urls = supplementalFeedUrls ?? [];
  if (urls.length === 0) throw new Error(`${slug} has no supplemental feeds; --supplemental-id-prefix does not apply`);
  const out: Record<string, string> = { ...(configured ?? {}) };
  const given = new Set<string>();
  for (const raw of prefixArgs) {
    const eq = raw.indexOf('=');
    const looksLikeUrl = eq > 0 && /^[a-z]+:\/\//i.test(raw);
    const [url, prefix] = looksLikeUrl ? [raw.slice(0, eq), raw.slice(eq + 1)] : [urls.length === 1 ? urls[0] : '', raw];
    if (!url) throw new Error(`${slug} has ${urls.length} supplemental feeds; pass --supplemental-id-prefix <url>=<prefix>`);
    if (!urls.includes(url)) throw new Error(`${slug}: ${url} is not one of its supplemental feeds (${urls.join(', ')})`);
    if (!prefix) throw new Error(`${slug}: empty id prefix for ${url}`);
    if (given.has(url)) throw new Error(`${slug}: two id prefixes given for ${url}`);
    if (configured?.[url] && configured[url] !== prefix) throw new Error(`${slug}: ${url} already has the configured id prefix "${configured[url]}"`);
    given.add(url);
    out[url] = prefix;
  }
  return out;
}

export function backfillSupplementalPolicy(slug: string, supplementalFeedUrls: string[] | undefined, busOnlyFlag: boolean, supplementalDirArgs: readonly string[] = []): BackfillSupplementalPolicy {
  const urls = supplementalFeedUrls ?? [];
  if (supplementalDirArgs.length > 0) {
    if (urls.length === 0) throw new Error(`${slug} has no supplemental feeds; --supplemental-zip-dir does not apply`);
    if (busOnlyFlag) throw new Error(`${slug}: --bus-only and --supplemental-zip-dir cannot be combined`);
    const dirs: Record<string, string> = {};
    for (const raw of supplementalDirArgs) {
      const eq = raw.indexOf('=');
      const looksLikeUrl = eq > 0 && /^[a-z]+:\/\//i.test(raw);
      const [url, dir] = looksLikeUrl ? [raw.slice(0, eq), raw.slice(eq + 1)] : [urls.length === 1 ? urls[0] : '', raw];
      if (!url) throw new Error(`${slug} has ${urls.length} supplemental feeds; pass --supplemental-zip-dir <url>=<dir> for each`);
      if (!urls.includes(url)) throw new Error(`${slug}: ${url} is not one of its supplemental feeds (${urls.join(', ')})`);
      if (!dir) throw new Error(`${slug}: no directory given for ${url}`);
      if (dirs[url]) throw new Error(`${slug}: two directories given for ${url}`);
      dirs[url] = dir;
    }
    const missing = urls.filter(u => !dirs[u]);
    if (missing.length > 0) throw new Error(`${slug}: no --supplemental-zip-dir for ${missing.join(', ')}; every supplemental feed needs its archive (or pass --bus-only alone)`);
    return { busOnly: false, supplementalExcluded: [], supplementalDirs: dirs };
  }
  if (urls.length === 0) return { busOnly: false, supplementalExcluded: [], supplementalDirs: {} };
  if (!busOnlyFlag) throw new Error(`${slug} has supplemental feeds (${urls.join(', ')}); pass --supplemental-zip-dir with their archives, or --bus-only to backfill the main feed only (supplemental routes excluded)`);
  return { busOnly: true, supplementalExcluded: urls, note: BUS_ONLY_NOTE, supplementalDirs: {} };
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
