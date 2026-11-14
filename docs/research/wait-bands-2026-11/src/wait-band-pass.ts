/**
 * Wait-band pass (CIV-1188). Read-only: fetches the published release from public URLs and writes CSVs locally.
 *
 * For every agency in the current release, every day type and every period, it puts each route's length into the
 * smallest wait band (10, 15, 20, 30, 60 minutes) at which the map's own filter would draw the route, or into
 * "slower than 60" (runs, passes no band) or "no service" (doesn't run). Plan: Atlas/editorial/drafts/wait-band-pass-plan.md.
 *
 * The rule code is imported from a checkout of the release's codeVersion (--rules), never from this checkout, because a
 * rule change alone can move these numbers by 30 points. The workflow (.github/workflows/wait-band-pass.yml) makes that
 * checkout; locally:
 *
 *   git worktree add /tmp/rules <codeVersion from atlas/release.json>   (plus node_modules)
 *   nice -n 15 npx tsx docs/research/wait-bands-2026-11/src/wait-band-pass.ts --rules /tmp/rules --out out [--only ttc,miway]
 *
 * Outputs in --out: wait-bands.csv (slug, name, country, day, period, band, route_km, share_pct, routes, release_id,
 * code_version), agencies.csv (one row per agency: totals, routes counted, routes left out as irregular, or why it was
 * skipped), and run.json (release, code version, counts).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DATA = (process.env.R2_PUBLIC_URL || 'https://data.transitatlas.fyi').replace(/\/$/, '');
// The custom domain answers bots with 403, so identify the script (and, in the cloud, use the bucket's public URL).
const HEADERS = { 'User-Agent': process.env.ATLAS_USER_AGENT || 'Atlas wait-band pass (github.com/Civic-Minds/Atlas)' };
const BANDS = [10, 15, 20, 30, 60] as const;
const BAND_LABELS = [...BANDS.map(String), 'slower_than_60', 'no_service'];
const DAYS = ['Weekday', 'Saturday', 'Sunday'];
const EARTH_KM = 6371;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function lineKm(coords: number[][]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lon1, lat1] = coords[i - 1];
    const [lon2, lat2] = coords[i];
    const p1 = (lat1 * Math.PI) / 180;
    const p2 = (lat2 * Math.PI) / 180;
    const dp = p2 - p1;
    const dl = ((lon2 - lon1) * Math.PI) / 180;
    const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    total += 2 * EARTH_KM * Math.asin(Math.sqrt(h));
  }
  return total;
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (err) {
      if (attempt === 3) throw new Error(`${url}: ${(err as Error).message}`);
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
  return null;
}

interface Release { releaseId: string; codeVersion: string; agencyPrefix: string }
interface IndexAgency { slug: string; name: string; region?: string; hiddenInProduction?: boolean; betaOnly?: boolean }

async function main() {
  const rulesDir = path.resolve(arg('--rules') ?? '.');
  const outDir = path.resolve(arg('--out') ?? 'wait-band-output');
  const only = new Set((arg('--only') ?? '').split(',').map(s => s.trim()).filter(Boolean));

  const release = await fetchJson<Release>(`${DATA}/atlas/release.json`);
  if (!release) throw new Error('No atlas/release.json');

  // Refuse to count with rule code that isn't the release's own.
  const { execSync } = await import('node:child_process');
  // --rules-commit names the commit when --rules is an exported tree (git archive) rather than a checkout.
  const rulesSha = arg('--rules-commit') ?? execSync('git rev-parse HEAD', { cwd: rulesDir }).toString().trim();
  if (!rulesSha.startsWith(release.codeVersion) && !release.codeVersion.startsWith(rulesSha)) {
    throw new Error(`--rules is at ${rulesSha}, but the release was built by ${release.codeVersion}. Check out that commit.`);
  }

  const mod = (rel: string) => import(pathToFileURL(path.join(rulesDir, rel)).href);
  const { normalizeRouteFilterFeatures, routePassesHeadwayFilter } = await mod('shared/routeHeadwayFilter.ts');
  const { isHiddenByIrregularFilter } = await mod('shared/irregularRoutes.ts');
  const { PERIOD_KEYS } = await mod('shared/config.ts');
  const { countryForRegion } = await mod('shared/regionCountry.ts');

  // The release's agencies: the public catalog at the release's code version (hidden and beta-only agencies are left out,
  // as in the fall-off study).
  const index = JSON.parse(readFileSync(path.join(rulesDir, 'public/data/index.json'), 'utf8')) as { agencies: IndexAgency[] };
  const agencies = index.agencies
    .filter(a => !a.hiddenInProduction && !a.betaOnly)
    .filter(a => only.size === 0 || only.has(a.slug))
    .sort((a, b) => a.slug.localeCompare(b.slug));

  mkdirSync(outDir, { recursive: true });
  const bandRows: string[] = ['slug,name,country,day,period,band,route_km,share_pct,routes,release_id,code_version'];
  const agencyRows: string[] = ['slug,name,country,status,total_route_km,routes_counted,routes_irregular_dropped,release_id,code_version'];
  let counted = 0;
  let skipped = 0;
  const started = Date.now();

  for (const agency of agencies) {
    const country = countryForRegion(agency.region) ?? '';
    const base = [agency.slug, agency.name, country].map(csvCell).join(',');
    const tail = `${csvCell(release.releaseId)},${csvCell(release.codeVersion)}`;
    let fc: { features?: any[] } | null;
    try {
      fc = await fetchJson(`${DATA}/${release.agencyPrefix}/${agency.slug}.json`);
    } catch (err) {
      agencyRows.push(`${base},fetch_failed,,,,${tail}`);
      console.error(`${agency.slug}: ${(err as Error).message}`);
      skipped++;
      continue;
    }
    if (!fc?.features) {
      agencyRows.push(`${base},not_in_release,,,,${tail}`);
      skipped++;
      continue;
    }

    const feats = fc.features.filter(f => f?.geometry?.type === 'LineString' && f.properties);
    normalizeRouteFilterFeatures(feats);
    // A route is its short name (or id) plus its branch; directions and day types are features of the same route.
    const routes = new Map<string, any[]>();
    for (const f of feats) {
      const p = f.properties;
      const key = `${p.routeShortName ?? p.routeId}::${p.routeBranch ?? ''}`;
      const list = routes.get(key) ?? [];
      list.push(f);
      routes.set(key, list);
    }

    const km = new Map<string, number>();
    const n = new Map<string, number>();
    let total = 0;
    let routesCounted = 0;
    let irregular = 0;
    for (const list of routes.values()) {
      const shown = list.filter(f => !isHiddenByIrregularFilter(f.properties));
      if (shown.length === 0) {
        irregular++;
        continue;
      }
      // Length = the longest single drawn pattern; directions are never added together.
      const len = Math.max(...shown.map(f => lineKm(f.geometry.coordinates)));
      total += len;
      routesCounted++;
      const props = shown.map(f => f.properties);
      for (const day of DAYS) {
        for (const period of PERIOD_KEYS) {
          let band = 'no_service';
          if (props.some((p: any) => p.day === day && p.routeRunsByPeriod?.[period])) band = 'slower_than_60';
          for (const b of BANDS) {
            if (routePassesHeadwayFilter(props, period, day, b)) {
              band = String(b);
              break;
            }
          }
          const key = `${day}|${period}|${band}`;
          km.set(key, (km.get(key) ?? 0) + len);
          n.set(key, (n.get(key) ?? 0) + 1);
        }
      }
    }

    for (const day of DAYS) {
      for (const period of PERIOD_KEYS) {
        for (const band of BAND_LABELS) {
          const key = `${day}|${period}|${band}`;
          const v = km.get(key) ?? 0;
          const share = total > 0 ? (100 * v) / total : 0;
          bandRows.push(`${base},${day},${period},${band},${v.toFixed(3)},${share.toFixed(2)},${n.get(key) ?? 0},${tail}`);
        }
      }
    }
    agencyRows.push(`${base},counted,${total.toFixed(3)},${routesCounted},${irregular},${tail}`);
    counted++;
    if (counted % 25 === 0) console.log(`${counted} agencies counted (${Math.round((Date.now() - started) / 1000)} s)`);
  }

  writeFileSync(path.join(outDir, 'wait-bands.csv'), bandRows.join('\n') + '\n');
  writeFileSync(path.join(outDir, 'agencies.csv'), agencyRows.join('\n') + '\n');
  const run = {
    releaseId: release.releaseId,
    codeVersion: release.codeVersion,
    rulesCheckout: rulesSha,
    agenciesInCatalog: agencies.length,
    agenciesCounted: counted,
    agenciesSkipped: skipped,
    bandRows: bandRows.length - 1,
    seconds: Math.round((Date.now() - started) / 1000),
    finishedAt: new Date().toISOString(),
  };
  writeFileSync(path.join(outDir, 'run.json'), JSON.stringify(run, null, 2) + '\n');
  console.log(JSON.stringify(run));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
