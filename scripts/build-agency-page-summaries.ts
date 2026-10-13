/**
 * Builds shared/data/agency-pages.json: the per-agency numbers behind the /agency/<slug> pages.
 *
 * READ ONLY against the published data release (release.json plus each agency's route file);
 * nothing is written to R2. It is a heavy run (every public agency's full route file, around
 * 1.5 GB in total), so it is NOT part of `npm run build`. Run it after a data release, throttled:
 *
 *   taskpolicy -b nice -n 15 npx tsx scripts/build-agency-page-summaries.ts [slug ...]
 *
 * Passing slugs refreshes only those agencies and keeps the rest of the file. `--identity-only` just
 * re-reads names, cities and short names from config (no network).
 * publish-data-release runs this automatically after a release goes public, failure-safe. The build reads the
 * committed file, so it works with R2 unreachable.
 *
 * Numbers use the same route rule as the map filter: a route's headway for a period is its worst
 * direction's (routeFilterHeadway). Nothing new is measured here; the service span is just the first
 * and last hour that the published per-hour headways cover on weekdays.
 */
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { DEFAULT_R2_PUBLIC_URL } from '../shared/config';
import { effectiveMode } from '../shared/modes';
import { routeGroupKey } from '../shared/routeGroupKey';
import { normalizeRouteFilterFeatures } from '../shared/routeHeadwayFilter';
import { routeListDisplay } from '../src/utils/effectiveHeadway';
import type { ShapeProperties } from '../src/hooks/useAgencyData';
import type { AgencyPageIdentity, AgencyPageRoute, AgencyPageSummary, AgencyPageSummaries } from '../shared/agencyPages';
import { trimRedundantCity } from '../shared/agencyPages';
import { countryForRegion } from '../shared/regionCountry';
import { agencyDisplayParts } from '../src/utils/format';

const OUT = 'shared/data/agency-pages.json';
// Slugs with a page, small enough for the map bundle (the agency card links only to real pages).
const SLUGS_OUT = 'shared/data/agency-page-slugs.json';
const base = (process.env.R2_PUBLIC_URL || DEFAULT_R2_PUBLIC_URL).replace(/\/$/, '');
const only = new Set(process.argv.slice(2).filter(arg => !arg.startsWith('--')));

type CatalogAgency = AgencyPageIdentity & { lastRefreshedAt?: string | null; lastFeedExpiry?: string | null; displayArea?: string };
type Catalog = { agencies: CatalogAgency[] };
type Feature = { geometry: { type: string }; properties: Record<string, unknown> };

async function getJson<T>(url: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return (await res.json()) as T;
    } catch (err) {
      lastError = err;
      await new Promise(r => setTimeout(r, 1500 * attempt));
    }
  }
  throw lastError;
}

export function summarize(
  features: Feature[],
  slug: string,
  lastRefreshedAt: string | null,
): Pick<AgencyPageSummary, 'routeCount' | 'routes' | 'span' | 'lastRefreshedAt' | 'sat' | 'sun'> {
  const lines = features.filter(f => f.geometry?.type === 'LineString' && f.properties.day === 'Weekday');
  normalizeRouteFilterFeatures(lines);
  const routes = new Map<string, AgencyPageRoute>();
  let first = Infinity;
  let last = -Infinity;
  // Per route: its direction/branch rows, so the numbers come from the route card's own display rule
  // (routeListDisplay: the best branch's cadence, "limited" when it runs but has no trustworthy cadence).
  const rows = new Map<string, ShapeProperties[]>();
  for (const f of lines) {
    const p = f.properties;
    const key = routeGroupKey(p.routeShortName, p.routeId);
    const shortName = typeof p.routeShortName === 'string' ? p.routeShortName.trim() : '';
    const longName = typeof p.routeLongName === 'string' && p.routeLongName.trim() ? p.routeLongName.trim() : null;
    const prev = routes.get(key);
    routes.set(key, {
      name: prev?.name ?? (shortName || longName || String(p.routeId ?? '')),
      longName: prev?.longName ?? longName,
      mode: prev?.mode ?? effectiveMode({ routeType: p.routeType as number, routeLongName: longName, routeShortName: shortName, agencySlug: slug }),
      midday: null, am: null, pm: null, evening: null, overnight: null,
    });
    (rows.get(key) ?? rows.set(key, []).get(key)!).push(p as unknown as ShapeProperties);
    const hours = p.headwayByHour as Record<string, number | null> | undefined;
    for (const [h, v] of Object.entries(hours ?? {})) {
      if (v == null) continue;
      first = Math.min(first, Number(h));
      last = Math.max(last, Number(h));
    }
  }
  for (const [key, r] of routes) {
    const ps = rows.get(key)!;
    const cols = [['midday', 'midday'], ['am', 'amPeak'], ['pm', 'pmPeak'], ['evening', 'evening'], ['overnight', 'overnight']] as const;
    const limited: NonNullable<AgencyPageRoute['limited']> = [];
    for (const [col, period] of cols) {
      const d = routeListDisplay(ps, period);
      r[col] = d.headway;
      if (d.limited) limited.push(col);
    }
    if (limited.length) r.limited = limited;
  }
  const hasDay = (day: string) => features.some(f => f.geometry?.type === 'LineString' && f.properties.day === day
    && Object.values((f.properties.headwayByHour as Record<string, number | null> | undefined) ?? {}).some(v => v != null));
  const list = [...routes.values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'en', { numeric: true }) || (a.longName ?? '').localeCompare(b.longName ?? ''));
  return {
    routeCount: list.length,
    routes: list,
    span: Number.isFinite(first) ? { first, last } : null,
    lastRefreshedAt,
    sat: hasDay('Saturday'),
    sun: hasDay('Sunday'),
  };
}

/** The agency's own config file: the source for its short name, label place and primary area. */
function readConfig(slug: string): { shortName?: string; labelPlace?: string; displayArea?: string } {
  try {
    return JSON.parse(readFileSync(`config/agencies/${slug}.json`, 'utf8'));
  } catch {
    return {};
  }
}

/** Primary city: the config's displayArea when set, else the first city the agency lists. */
export function primaryCity(a: { displayArea?: string; cities?: string[]; region?: string; name: string }): string {
  return a.displayArea?.trim() || a.cities?.[0]?.split(',')[0]?.trim() || a.region || a.name;
}

/**
 * "TTC (Toronto)": short name (else the display name) plus a place in brackets.
 * - `labelPlace` in the agency config wins ("YRT (York Region)"); an empty one drops the bracket.
 * - Otherwise the place is the config's displayArea, else the first city the agency lists, but that
 *   city is dropped when the name already names a region, county or district ("Durham Region
 *   Transit"), since the first city is then often just where the stops happen to be densest.
 */
export function displayNameFor(a: CatalogAgency & { shortName?: string; labelPlace?: string }): string {
  const { primary, secondary } = agencyDisplayParts(a.name, a.cities, a.displayArea);
  const base = a.shortName ?? primary;
  if (a.labelPlace !== undefined) return trimRedundantCity(a.labelPlace ? `${base} (${a.labelPlace})` : base);
  if (a.shortName) return trimRedundantCity(`${a.shortName} (${primaryCity(a)})`);
  if (!a.displayArea && REGIONAL_NAME.test(primary)) return primary;
  return trimRedundantCity(secondary ? `${primary} (${secondary})` : primary);
}

const REGIONAL_NAME = /\b(Region|Regional|County|Counties|District|Area|Corridor|Municipality|Rural)\b/i;

function identityFor(a: CatalogAgency) {
  const cfg = readConfig(a.slug);
  const full = { ...a, shortName: cfg.shortName, labelPlace: cfg.labelPlace, displayArea: cfg.displayArea ?? a.displayArea };
  return {
    slug: a.slug,
    name: a.name,
    region: a.region,
    displayName: displayNameFor(full),
    city: primaryCity(full),
    country: countryForRegion(a.region) ?? undefined,
    center: a.center,
    bbox: a.bbox,
    websiteUrl: a.websiteUrl,
    validThrough: a.lastFeedExpiry ?? null,
  };
}

/** Write via a temp file and rename, so a crash never leaves a half-written summary. */
function writeAtomic(file: string, contents: string): void {
  writeFileSync(`${file}.tmp`, contents);
  renameSync(`${file}.tmp`, file);
}

function writeOutputs(out: AgencyPageSummaries): void {
  writeAtomic(OUT, JSON.stringify(out) + '\n');
  writeAtomic(SLUGS_OUT, JSON.stringify(out.agencies.filter(a => a.routes.some(r => r.midday != null)).map(a => a.slug)) + '\n');
}

async function main() {
  const catalog = JSON.parse(readFileSync('public/data/catalog-public.json', 'utf8')) as Catalog;
  const previous: AgencyPageSummaries | null = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;

  // --identity-only: refresh names, cities and short names from config with no network.
  if (process.argv.includes('--identity-only')) {
    if (!previous) throw new Error(`No ${OUT} to update`);
    const byslug = new Map(catalog.agencies.map(a => [a.slug, a]));
    writeOutputs({ ...previous, agencies: previous.agencies.map(p => (byslug.has(p.slug) ? { ...p, ...identityFor(byslug.get(p.slug)!) } : p)) });
    console.log(`Updated names and cities for ${previous.agencies.length} agencies in ${OUT}`);
    return;
  }

  const release = await getJson<{ releaseId: string; generatedAt: string; agencyPrefix: string }>(`${base}/atlas/release.json?t=${Date.now()}`);
  const prevBySlug = new Map((previous?.agencies ?? []).map(a => [a.slug, a]));
  const keep = new Map(only.size && previous ? previous.agencies.map(a => [a.slug, a]) : []);
  const targets = catalog.agencies.filter(a => only.size === 0 || only.has(a.slug));
  const results = new Map<string, AgencyPageSummary>();
  const failed: string[] = [];
  let done = 0;
  const queue = [...targets];
  async function worker() {
    for (let a = queue.shift(); a; a = queue.shift()) {
      try {
        const data = await getJson<{ features: Feature[] }>(`${base}/${release.agencyPrefix}/${a.slug}.json`);
        results.set(a.slug, { ...identityFor(a), ...summarize(data.features, a.slug, a.lastRefreshedAt ?? null) });
      } catch (err) {
        // Keep the previous numbers for an agency that failed, rather than dropping its page.
        failed.push(a.slug);
        const old = prevBySlug.get(a.slug);
        if (old) results.set(a.slug, { ...old, ...identityFor(a) });
        console.warn(`FAILED ${a.slug}: ${(err as Error).message}${old ? ' (kept the previous numbers)' : ''}`);
      }
      if (++done % 25 === 0) console.log(`${done}/${targets.length}`);
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  // A mostly failed run means the data was unreachable, not that agencies are gone: write nothing.
  if (failed.length > Math.max(5, targets.length * 0.1)) {
    throw new Error(`${failed.length} of ${targets.length} agencies failed; summary files left untouched`);
  }
  const merged = new Map([...keep, ...results]);
  const out: AgencyPageSummaries = {
    releaseId: release.releaseId,
    generatedAt: release.generatedAt,
    agencies: [...merged.values()].sort((a, b) => a.slug.localeCompare(b.slug)),
  };
  writeOutputs(out);
  console.log(`Wrote ${OUT}: ${out.agencies.length} agencies, release ${release.releaseId}${failed.length ? `; ${failed.length} kept from the previous run: ${failed.join(', ')}` : ''}`);
}

if (process.argv[1]?.endsWith('build-agency-page-summaries.ts')) await main();
