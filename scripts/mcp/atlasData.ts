/**
 * CIV-1650: the data behind the private local Atlas MCP server (scripts/mcp/atlas-mcp.ts). Reads Atlas's own processed
 * per-agency route files from disk and answers with the map's numbers, computed by the map's own shared functions
 * (routeListFilterDisplay, routeListDisplay, routeRuns, frequencyChange), never re-derived here. Read-only: nothing is
 * fetched or written.
 *
 * Where the route files come from, first match wins (ATLAS_MCP_DATA_DIR overrides both):
 * - tmp/agency-pages-cache/<releaseId>/<slug>.json: a published release, cached by build-agency-page-summaries.ts;
 * - tmp/process-preview/<slug>/<slug>.json: a local `npm run process -- --dry-run` of the agency.
 * Public agencies only (public/data/catalog-public.json): a beta-only or unlaunched agency is never answered.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PERIOD_KEYS, PERIOD_LABELS, type PeriodKey } from '../../shared/config';
import { DAY_TYPES, type DayType } from '../../shared/rules/days';
import { routeGroupKey } from '../../shared/routeGroupKey';
import { normalizeRouteFilterFeatures } from '../../shared/routeHeadwayFilter';
import { frequencyChange } from '../../shared/frequencyChange';
import { PUBLIC_TIER_MAXES, headwayGradeOn } from '../../shared/frequencyRules';
import { clockTime } from '../../shared/timeText';
import { compareRouteNumber } from '../../shared/sortCompare';
import { modeLabel, effectiveMode } from '../../shared/modes';
import { routeListCellText, routeListDisplay, routeListFilterDisplay } from '../../src/utils/effectiveHeadway';
import type { ShapeProperties } from '../../src/hooks/useIntervalStats';
import { routeRuns } from '../build-agency-page-summaries';
import type { StudioBeforeAfterFile } from '../../shared/studioBeforeAfter';

/** The Atlas checkout the server reads (this file's repo by default). */
export const ATLAS_ROOT = resolve(process.env.ATLAS_ROOT ?? join(import.meta.dirname, '..', '..'));

type Feature = { geometry: { type: string } | null; properties: Record<string, unknown> };
interface CatalogAgency { slug: string; name: string; region?: string; cities?: string[]; lastFeedExpiry?: string | null; lastRefreshedAt?: string | null; betaOnly?: boolean }

let catalog: CatalogAgency[] | null = null;
/** The public catalog: the agencies the public site shows. */
export function publicAgencies(): CatalogAgency[] {
  catalog ??= (JSON.parse(readFileSync(join(ATLAS_ROOT, 'public/data/catalog-public.json'), 'utf8')) as { agencies: CatalogAgency[] }).agencies.filter(a => !a.betaOnly);
  return catalog;
}

/** Each agency with a route file on disk, and where it is. */
export function routeFiles(): Map<string, string> {
  const out = new Map<string, string>();
  const add = (slug: string, file: string) => { if (!out.has(slug) && existsSync(file)) out.set(slug, file); };
  const override = process.env.ATLAS_MCP_DATA_DIR;
  const dirs: Array<{ dir: string; nested: boolean }> = [];
  if (override) dirs.push({ dir: resolve(override), nested: false }, { dir: resolve(override), nested: true });
  const cache = join(ATLAS_ROOT, 'tmp/agency-pages-cache');
  if (existsSync(cache)) {
    const newest = readdirSync(cache).map(d => join(cache, d)).filter(d => statSync(d).isDirectory()).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
    if (newest) dirs.push({ dir: newest, nested: false });
  }
  dirs.push({ dir: join(ATLAS_ROOT, 'tmp/process-preview'), nested: true });
  for (const { dir, nested } of dirs) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (nested) add(name, join(dir, name, `${name}.json`));
      else if (/^[a-z0-9-]+\.json$/.test(name) && !/-(stops|corridors|trips|stops-meta|sections|shape-anomalies)\.json$/.test(name)) add(name.slice(0, -5), join(dir, name));
    }
  }
  return out;
}

/** The public agencies Atlas can answer for here. */
export function availableAgencies(): Array<CatalogAgency & { file: string }> {
  const files = routeFiles();
  return publicAgencies().filter(a => files.has(a.slug)).map(a => ({ ...a, file: files.get(a.slug)! }));
}

/** An agency by slug or name (case-insensitive), among those available. */
export function findAgency(query: string, list: Array<CatalogAgency & { file: string }> = availableAgencies()): (CatalogAgency & { file: string }) | null {
  const q = query.trim().toLowerCase();
  return list.find(a => a.slug === q) ?? list.find(a => a.name.toLowerCase() === q) ?? list.find(a => a.name.toLowerCase().includes(q)) ?? null;
}

interface RouteRows { key: string; name: string; shortName: string; longName: string | null; mode: string; rows: ShapeProperties[] }
const loaded = new Map<string, Feature[]>();

function lines(slug: string, file: string): Feature[] {
  if (!loaded.has(slug)) {
    const features = (JSON.parse(readFileSync(file, 'utf8')) as { features: Feature[] }).features.filter(f => f.geometry?.type === 'LineString');
    normalizeRouteFilterFeatures(features);
    loaded.set(slug, features);
  }
  return loaded.get(slug)!;
}

/** Each route's rows on one day type, grouped as the map groups them. */
export function routesOn(agency: CatalogAgency & { file: string }, day: DayType): RouteRows[] {
  const byKey = new Map<string, RouteRows>();
  for (const f of lines(agency.slug, agency.file)) {
    const p = f.properties;
    if (p.day !== day) continue;
    const key = routeGroupKey(p.routeShortName as string, p.routeId as string);
    const shortName = typeof p.routeShortName === 'string' ? p.routeShortName.trim() : '';
    const longName = typeof p.routeLongName === 'string' && p.routeLongName.trim() ? p.routeLongName.trim() : null;
    let r = byKey.get(key);
    if (!r) {
      const mode = modeLabel(effectiveMode({ routeType: p.routeType as number, routeLongName: longName, routeShortName: shortName, agencySlug: agency.slug, bookingRequired: p.bookingRequired === true }));
      byKey.set(key, r = { key, name: shortName || longName || String(p.routeId ?? ''), shortName, longName, mode, rows: [] });
    }
    r.rows.push(p as unknown as ShapeProperties);
  }
  return [...byKey.values()].sort((a, b) => compareRouteNumber(a.name, b.name, a.longName, b.longName));
}

/** A route by short name, long name or id. */
export function findRoute(routes: RouteRows[], query: string): RouteRows | null {
  const q = query.trim().toLowerCase();
  return routes.find(r => r.shortName.toLowerCase() === q) ?? routes.find(r => r.name.toLowerCase() === q)
    ?? routes.find(r => (r.longName ?? '').toLowerCase() === q) ?? routes.find(r => `${r.shortName} ${r.longName ?? ''}`.toLowerCase().includes(q)) ?? null;
}

/**
 * One period's figure as the map shows it: the filter's number (what the frequency filter compares) and the route list's
 * words, which name a long gap where the card does ("every 15 min, with one 32 min gap").
 */
export function periodFigure(r: RouteRows, period: PeriodKey) {
  const filter = routeListFilterDisplay(r.rows, period);
  const shown = routeListCellText(routeListDisplay(r.rows, period), false);
  const minutes = filter.headway != null && filter.headway < 999 ? filter.headway : null;
  return {
    period: PERIOD_LABELS[period],
    minutes,
    shown: shown ?? (filter.limited ? 'limited service' : 'no service'),
    publicGrade: minutes == null ? null : headwayGradeOn(minutes, PUBLIC_TIER_MAXES),
  };
}

/** The first and last departures of the day, and any break inside it, as clock times. */
export function serviceSpan(r: RouteRows) {
  const runs = routeRuns(r.rows as never, undefined);
  if (!runs) return null;
  return {
    first: runs.first != null ? clockTime(runs.first) : runs.hours.length ? `during the ${clockTime(runs.hours[0] * 60)} hour` : null,
    last: runs.last != null ? clockTime(runs.last) : runs.hours.length ? `during the ${clockTime(runs.hours[runs.hours.length - 1] * 60)} hour` : null,
    breaks: (runs.gaps ?? []).map(([a, b]) => `${clockTime(a)}–${clockTime(b)}`),
  };
}

export const parseDay = (day: unknown): DayType => (DAY_TYPES as readonly string[]).find(d => d.toLowerCase() === String(day ?? 'Weekday').toLowerCase()) as DayType ?? 'Weekday';
export const parsePeriod = (period: unknown): PeriodKey | null => {
  const q = String(period ?? '').toLowerCase().replace(/[\s_-]/g, '');
  return PERIOD_KEYS.find(k => k.toLowerCase() === q || PERIOD_LABELS[k].toLowerCase().replace(/\s/g, '') === q) ?? null;
};

/** The routes at or under `every` minutes in a period on a day, best first. */
export function routesMeeting(agency: CatalogAgency & { file: string }, day: DayType, period: PeriodKey, every: number) {
  const all = routesOn(agency, day);
  const figures = all.map(r => ({ route: r.name, longName: r.longName, mode: r.mode, ...periodFigure(r, period) }));
  const running = figures.filter(f => f.minutes != null);
  const meeting = running.filter(f => f.minutes! <= every).sort((a, b) => a.minutes! - b.minutes!);
  return { routesOnDay: all.length, routesRunningInPeriod: running.length, meeting };
}

/** Studio's schedule comparison for an agency, if one was built (tmp/studio/<slug>-before-after.json). */
export function scheduleComparison(slug: string): StudioBeforeAfterFile | null {
  const candidates = [join(ATLAS_ROOT, 'tmp/studio'), join(ATLAS_ROOT, '..', 'Atlas-worktrees/bundle/tmp/studio')];
  for (const dir of candidates) {
    const file = join(dir, `${slug}-before-after.json`);
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as StudioBeforeAfterFile;
  }
  return null;
}

/** Frequency changes in a comparison, by the shared rule (a grade move on the one scale), biggest first. */
export function frequencyChanges(file: StudioBeforeAfterFile) {
  const out: Array<{ route: string; name: string | null; period: string; before: number | null; after: number | null; steps: number; better: boolean; publicChange: boolean }> = [];
  for (const c of file.changes) for (const period of PERIOD_KEYS) {
    const before = c.before?.headway[period] ?? null, after = c.after?.headway[period] ?? null;
    const change = frequencyChange(before, after);
    if (change) out.push({ route: c.route, name: c.name, period: PERIOD_LABELS[period], before, after, steps: change.steps, better: change.better, publicChange: change.publicChange });
  }
  return out.sort((a, b) => b.steps - a.steps || Number(b.publicChange) - Number(a.publicChange));
}
