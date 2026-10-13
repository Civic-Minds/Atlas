/**
 * Builds shared/data/agency-pages.json: the per-agency numbers behind the /agency/<slug> pages.
 *
 * READ ONLY against the published data release (release.json plus each agency's route file);
 * nothing is written to R2. It is a heavy run (every public agency's full route file, around
 * 1.5 GB in total), so it is NOT part of `npm run build`. Run it after a data release, throttled:
 *
 *   taskpolicy -b nice -n 15 npx tsx scripts/build-agency-page-summaries.ts [slug ...]
 *
 * Passing slugs refreshes only those agencies and keeps the rest of the file. The build reads the
 * committed file, so it works with R2 unreachable.
 *
 * Numbers use the same route rule as the map filter: a route's headway for a period is its worst
 * direction's (routeFilterHeadway). Nothing new is measured here; the service span is just the first
 * and last hour that the published per-hour headways cover on weekdays.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { DEFAULT_R2_PUBLIC_URL } from '../shared/config';
import { effectiveMode } from '../shared/modes';
import { routeGroupKey } from '../shared/routeGroupKey';
import { normalizeRouteFilterFeatures, routeFilterHeadway } from '../shared/routeHeadwayFilter';
import type { AgencyPageIdentity, AgencyPageRoute, AgencyPageSummary, AgencyPageSummaries } from '../shared/agencyPages';
import { trimRedundantCity } from '../shared/agencyPages';
import { countryForRegion } from '../shared/regionCountry';
import { agencyDisplayParts } from '../src/utils/format';

const OUT = 'shared/data/agency-pages.json';
// Slugs with a page, small enough for the map bundle (the agency card links only to real pages).
const SLUGS_OUT = 'shared/data/agency-page-slugs.json';
const base = (process.env.R2_PUBLIC_URL || DEFAULT_R2_PUBLIC_URL).replace(/\/$/, '');
const only = new Set(process.argv.slice(2));

type CatalogAgency = AgencyPageIdentity & { lastRefreshedAt?: string | null; displayArea?: string };
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
): Pick<AgencyPageSummary, 'routeCount' | 'routes' | 'span' | 'lastRefreshedAt'> {
  const lines = features.filter(f => f.geometry?.type === 'LineString' && f.properties.day === 'Weekday');
  normalizeRouteFilterFeatures(lines);
  const routes = new Map<string, AgencyPageRoute>();
  let first = Infinity;
  let last = -Infinity;
  const best = (prev: number | null | undefined, next: number | null) =>
    next == null ? prev ?? null : prev == null ? Math.round(next) : Math.min(prev, Math.round(next));
  for (const f of lines) {
    const p = f.properties;
    const key = routeGroupKey(p.routeShortName, p.routeId);
    const shortName = typeof p.routeShortName === 'string' ? p.routeShortName.trim() : '';
    const longName = typeof p.routeLongName === 'string' && p.routeLongName.trim() ? p.routeLongName.trim() : null;
    const prev = routes.get(key);
    // A route counts at its best passing pattern, like the map: some feature passes.
    routes.set(key, {
      name: prev?.name ?? (shortName || longName || String(p.routeId ?? '')),
      longName: prev?.longName ?? longName,
      mode: prev?.mode ?? effectiveMode({ routeType: p.routeType as number, routeLongName: longName, routeShortName: shortName, agencySlug: slug }),
      midday: best(prev?.midday, routeFilterHeadway(p, 'midday')),
      am: best(prev?.am, routeFilterHeadway(p, 'amPeak')),
      pm: best(prev?.pm, routeFilterHeadway(p, 'pmPeak')),
    });
    const hours = p.headwayByHour as Record<string, number | null> | undefined;
    for (const [h, v] of Object.entries(hours ?? {})) {
      if (v == null) continue;
      first = Math.min(first, Number(h));
      last = Math.max(last, Number(h));
    }
  }
  const list = [...routes.values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'en', { numeric: true }) || (a.longName ?? '').localeCompare(b.longName ?? ''));
  return {
    routeCount: list.length,
    routes: list,
    span: Number.isFinite(first) ? { first, last } : null,
    lastRefreshedAt,
  };
}

/** "TTC (Toronto)": the display name plus its city; no bracket when the name already holds the city. */
function displayNameFor(a: CatalogAgency): string {
  const { primary, secondary } = agencyDisplayParts(a.name, a.cities, a.displayArea);
  return trimRedundantCity(secondary ? `${primary} (${secondary})` : primary);
}

async function main() {
  const catalog = JSON.parse(readFileSync('public/data/catalog-public.json', 'utf8')) as Catalog;
  const release = await getJson<{ releaseId: string; generatedAt: string; agencyPrefix: string }>(`${base}/atlas/release.json`);
  const previous: AgencyPageSummaries | null = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
  const keep = new Map((only.size && previous ? previous.agencies : []).map(a => [a.slug, a]));
  const targets = catalog.agencies.filter(a => only.size === 0 || only.has(a.slug));
  const results = new Map<string, AgencyPageSummary>();
  let done = 0;
  const queue = [...targets];
  async function worker() {
    for (let a = queue.shift(); a; a = queue.shift()) {
      try {
        const data = await getJson<{ features: Feature[] }>(`${base}/${release.agencyPrefix}/${a.slug}.json`);
        results.set(a.slug, {
          slug: a.slug,
          name: a.name,
          region: a.region,
          displayName: displayNameFor(a),
          city: a.cities?.[0]?.split(',')[0]?.trim() || a.region || a.name,
          country: countryForRegion(a.region) ?? undefined,
          center: a.center,
          bbox: a.bbox,
          websiteUrl: a.websiteUrl,
          ...summarize(data.features, a.slug, a.lastRefreshedAt ?? null),
        });
      } catch (err) {
        console.warn(`skipped ${a.slug}: ${(err as Error).message}`);
      }
      if (++done % 25 === 0) console.log(`${done}/${targets.length}`);
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  const merged = new Map([...keep, ...results]);
  const out: AgencyPageSummaries = {
    releaseId: release.releaseId,
    generatedAt: release.generatedAt,
    agencies: [...merged.values()].sort((a, b) => a.slug.localeCompare(b.slug)),
  };
  writeFileSync(OUT, JSON.stringify(out) + '\n');
  writeFileSync(SLUGS_OUT, JSON.stringify(out.agencies.filter(a => a.routes.some(r => r.midday != null)).map(a => a.slug)) + '\n');
  console.log(`Wrote ${OUT}: ${out.agencies.length} agencies, release ${release.releaseId}`);
}

if (process.argv[1]?.endsWith('build-agency-page-summaries.ts')) await main();
