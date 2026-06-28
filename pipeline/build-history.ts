#!/usr/bin/env npx tsx
/**
 * build-history.ts — compile generated and manual history configurations.
 * Usage: npm run build-history
 *
 * Data sources:
 *   atlas (public)         — atlas/{slug}.json  →  current headways
 *   atlas-archive (private) — history/{slug}/*.json  →  historical period snapshots
 *
 * Agencies in index.json appear automatically once they have ≥1 archive snapshot
 * with a route whose current headway differs from the archived one.
 * BASE_HISTORY covers agencies NOT in the registry (e.g. GCRTA case studies).
 */
import { writeFileSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { config } from 'dotenv';
import { r2Get, r2ListArchive, r2GetArchive } from './r2.js';

config({ path: resolve('.env.local') });

interface ManualAgencyHistory {
  slug: string;
  name: string;
  region: string;
  center?: [number, number];
  routes: Array<{
    routeShortName: string;
    routeName: string;
    manualSnapshots: Array<{ label: string; year: number; weekdayHeadwayMin: number; note?: string }>;
  }>;
}

// Manually seeded agencies NOT in the Atlas registry (e.g. historical case studies).
const BASE_HISTORY: ManualAgencyHistory[] = [
  {
    slug: 'gcrta',
    name: 'Greater Cleveland RTA',
    region: 'Ohio',
    center: [41.4993, -81.6944],
    routes: [
      {
        routeShortName: 'HealthLine',
        routeName: 'Euclid Avenue BRT',
        manualSnapshots: [
          { label: '2008 Launch', year: 2008, weekdayHeadwayMin: 5 },
          { label: '2016', year: 2016, weekdayHeadwayMin: 7.5 },
          { label: '2026', year: 2026, weekdayHeadwayMin: 15 },
        ],
      },
    ],
  },
];

function parsePeriodKey(key: string) {
  // YYYYMMDD (feed_end_date without dashes, e.g. 20261231)
  const compact = key.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    const year = parseInt(compact[1]);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[parseInt(compact[2]) - 1] ?? '';
    return { year, label: `${month} ${year}` };
  }
  // YYYY-MM-DD
  const dashed = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dashed) {
    const year = parseInt(dashed[1]);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[parseInt(dashed[2]) - 1] ?? '';
    return { year, label: `${month} ${year}` };
  }
  // Fallback: extract year
  const yearMatch = key.match(/\b(20\d{2})\b/);
  const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
  return { year, label: key };
}

/** Extract compact { routeShortName → { headway, routeLongName } } from a full GeoJSON FeatureCollection. */
function extractCurrentHeadways(geojson: any): Record<string, { headway: number; routeLongName?: string }> {
  const routes: Record<string, { headway: number; routeLongName?: string }> = {};
  for (const f of (geojson.features ?? [])) {
    const p = f.properties;
    if (!p?.routeShortName || p.day !== 'Weekday' || p.directionId !== 0) continue;
    const sn = String(p.routeShortName);
    const h = p.headway != null ? Number(p.headway) : null;
    if (h == null) continue;
    const ln = p.routeLongName ? String(p.routeLongName) : undefined;
    if (!routes[sn] || h < routes[sn].headway) {
      routes[sn] = { headway: h, routeLongName: ln ?? routes[sn]?.routeLongName };
    }
  }
  return routes;
}

async function main() {
  console.log('Compiling route history from R2 snapshots...');

  if (!process.env.R2_ACCESS_KEY_ID) {
    console.error('Missing R2 credentials. Add R2_* vars to .env.local');
    process.exit(1);
  }

  // Load index.json for name/region/center lookup
  const indexPath = resolve('public/data/index.json');
  const index: { agencies: Array<{ slug: string; name: string; center: [number, number] }> } =
    JSON.parse(readFileSync(indexPath, 'utf8'));
  const registryBySlug = new Map(index.agencies.map(a => [a.slug, a]));

  // 1. List all archive snapshot files under history/
  const keys = await r2ListArchive('history/');
  console.log(`Found ${keys.length} snapshot files in atlas-archive`);

  // Map: slug → periodKey → { routes: { [routeShortName]: { headway, tier, routeLongName } } }
  const archiveData: Record<string, Record<string, any>> = {};

  // 2. Fetch all archive snapshots in parallel
  await Promise.all(
    keys.map(async key => {
      const parts = key.split('/');
      if (parts.length < 3) return;
      const slug = parts[1];
      const filename = parts[2];
      if (!filename.endsWith('.json') || filename === 'latest.json') return;
      const periodKey = filename.replace('.json', '');
      try {
        const raw = await r2GetArchive(key);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!archiveData[slug]) archiveData[slug] = {};
        archiveData[slug][periodKey] = parsed;
      } catch (err) {
        console.error(`Failed to parse snapshot: ${key}`, err);
      }
    })
  );

  // 3. For registered agencies that have archive snapshots, fetch current GeoJSON from atlas
  const slugsWithArchive = Object.keys(archiveData).filter(s => registryBySlug.has(s));
  console.log(`Fetching current GeoJSON for ${slugsWithArchive.length} agencies with archive data...`);

  const currentHeadways: Record<string, Record<string, { headway: number; routeLongName?: string }>> = {};
  await Promise.all(
    slugsWithArchive.map(async slug => {
      try {
        const raw = await r2Get(`atlas/${slug}.json`);
        if (!raw) return;
        currentHeadways[slug] = extractCurrentHeadways(JSON.parse(raw));
      } catch (err) {
        console.error(`Failed to fetch current GeoJSON for ${slug}:`, err);
      }
    })
  );

  const historyData: any[] = [];
  const processedSlugs = new Set<string>();

  // 4. Process BASE_HISTORY agencies (manual case studies + any R2 data they have)
  for (const agency of BASE_HISTORY) {
    processedSlugs.add(agency.slug);
    const agencyRoutes: any[] = [];

    for (const route of agency.routes) {
      const manualSnapshots = [...route.manualSnapshots];
      const manualYears = new Set(manualSnapshots.map(s => s.year));
      const dynamicSnapshots: any[] = [];
      const agencySnaps = archiveData[agency.slug] ?? {};

      for (const [periodKey, snap] of Object.entries(agencySnaps)) {
        const routeData = (snap as any).routes?.[route.routeShortName];
        if (routeData?.headway != null) {
          const { year, label } = parsePeriodKey(periodKey);
          if (!manualYears.has(year)) {
            dynamicSnapshots.push({ label, year, weekdayHeadwayMin: routeData.headway });
          }
        }
      }

      dynamicSnapshots.sort((a, b) => a.year - b.year);
      const uniqueDynamic: typeof dynamicSnapshots = [];
      for (const snap of dynamicSnapshots) {
        if (!uniqueDynamic.some(s => s.year === snap.year)) uniqueDynamic.push(snap);
      }

      const mergedSnapshots = [...manualSnapshots, ...uniqueDynamic].sort((a, b) => a.year - b.year);
      if (mergedSnapshots.length >= 2) {
        agencyRoutes.push({ routeShortName: route.routeShortName, routeName: route.routeName, snapshots: mergedSnapshots });
      }
    }

    if (agencyRoutes.length > 0) {
      historyData.push({ slug: agency.slug, name: agency.name, region: agency.region, center: agency.center, routes: agencyRoutes });
    }
  }

  // 5. Auto-discover registered agencies: combine archive snapshots + current atlas data
  const currentYear = new Date().getFullYear();

  for (const slug of slugsWithArchive) {
    if (processedSlugs.has(slug)) continue;
    const registryEntry = registryBySlug.get(slug)!;
    const agencySnaps = archiveData[slug];
    const current = currentHeadways[slug] ?? {};

    // Collect all routes from archive snapshots
    const routeSnapshotsMap: Record<string, any[]> = {};

    for (const [periodKey, snap] of Object.entries(agencySnaps)) {
      const { year, label } = parsePeriodKey(periodKey);
      for (const [routeShortName, routeData] of Object.entries((snap as any).routes ?? {})) {
        const h = (routeData as any).headway;
        if (h == null) continue;
        if (!routeSnapshotsMap[routeShortName]) routeSnapshotsMap[routeShortName] = [];
        if (!routeSnapshotsMap[routeShortName].some(s => s.year === year)) {
          routeSnapshotsMap[routeShortName].push({
            label,
            year,
            weekdayHeadwayMin: h,
            routeLongName: (routeData as any).routeLongName,
          });
        }
      }
    }

    // Add current atlas data as the "now" snapshot for routes where headways changed
    const agencyRoutes: any[] = [];

    for (const [routeShortName, archiveSnaps] of Object.entries(routeSnapshotsMap)) {
      const currentRoute = current[routeShortName];
      if (!currentRoute) continue; // route no longer exists in current GTFS

      archiveSnaps.sort((a, b) => a.year - b.year);

      // Only add the current snapshot if it's not already covered by an archive snapshot this year
      const hasCurrentYearArchive = archiveSnaps.some(s => s.year === currentYear);
      const allSnaps = hasCurrentYearArchive
        ? archiveSnaps
        : [...archiveSnaps, { label: String(currentYear), year: currentYear, weekdayHeadwayMin: currentRoute.headway }];

      allSnaps.sort((a, b) => a.year - b.year);

      // Only include if headway actually changed between earliest and latest
      const first = allSnaps[0];
      const last = allSnaps[allSnaps.length - 1];
      if (first.weekdayHeadwayMin === last.weekdayHeadwayMin) continue;

      const routeLongName = archiveSnaps.find((s: any) => s.routeLongName)?.routeLongName ?? currentRoute.routeLongName;
      agencyRoutes.push({
        routeShortName,
        routeName: routeLongName || routeShortName,
        snapshots: allSnaps.map(({ label, year, weekdayHeadwayMin }) => ({ label, year, weekdayHeadwayMin })),
      });
    }

    if (agencyRoutes.length === 0) continue;

    // Sort routes: biggest % change first
    agencyRoutes.sort((a, b) => {
      const pct = (r: any[]) => Math.abs(r[r.length - 1].weekdayHeadwayMin / r[0].weekdayHeadwayMin - 1);
      return pct(b.snapshots) - pct(a.snapshots);
    });

    historyData.push({
      slug,
      name: registryEntry.name,
      region: 'Canada',
      center: registryEntry.center,
      routes: agencyRoutes,
    });

    console.log(`  auto-discovered: ${registryEntry.name} (${agencyRoutes.length} routes with changes)`);
  }

  // 6. Generate TS code for shared/historyConfig.ts
  const tsCode = `// Generated by pipeline/build-history.ts. Do not edit manually.

export interface RouteSnapshot {
  label: string;
  year: number;
  weekdayHeadwayMin: number;
  note?: string;
}

export interface RouteHistoryEntry {
  routeShortName: string;
  routeName: string;
  snapshots: RouteSnapshot[];
}

export interface AgencyHistory {
  slug: string;
  name: string;
  region: string;
  center?: [number, number];
  routes: RouteHistoryEntry[];
}

export const HISTORY_DATA: AgencyHistory[] = ${JSON.stringify(historyData, null, 2)};
`;

  const outputPath = resolve('shared/historyConfig.ts');
  writeFileSync(outputPath, tsCode);
  console.log(`Generated ${historyData.length} agencies → ${outputPath}`);
}

main().catch(console.error);
