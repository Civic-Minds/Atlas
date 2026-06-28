#!/usr/bin/env npx tsx
/**
 * build-history.ts — compile generated and manual history configurations.
 * Usage: npm run build-history
 *
 * Agencies in our registry (index.json) appear automatically once they have
 * ≥2 R2 snapshots with a headway change on the same route.
 * BASE_HISTORY covers agencies NOT in the registry (e.g. GCRTA case studies).
 */
import { writeFileSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { config } from 'dotenv';
import { r2ListArchive, r2GetArchive } from './r2.js';

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
  // YYYYMMDD (feed_end_date without dashes)
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

  // 1. List all keys under history/ in the archive bucket
  const keys = await r2ListArchive('history/');
  console.log(`Found ${keys.length} snapshot files in R2`);

  // Map: slug → periodKey → parsed snapshot data
  const snapshotData: Record<string, Record<string, any>> = {};

  // 2. Fetch and parse each snapshot in parallel
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
        if (!snapshotData[slug]) snapshotData[slug] = {};
        snapshotData[slug][periodKey] = parsed;
      } catch (err) {
        console.error(`Failed to parse snapshot: ${key}`, err);
      }
    })
  );

  const historyData: any[] = [];
  const processedSlugs = new Set<string>();

  // 3. Process BASE_HISTORY agencies (manual case studies + any R2 data they have)
  for (const agency of BASE_HISTORY) {
    processedSlugs.add(agency.slug);
    const agencyRoutes: any[] = [];

    for (const route of agency.routes) {
      const manualSnapshots = [...route.manualSnapshots];
      const manualYears = new Set(manualSnapshots.map(s => s.year));
      const dynamicSnapshots: any[] = [];
      const agencySnaps = snapshotData[agency.slug] ?? {};

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

  // 4. Auto-discover registered agencies from R2 snapshots
  for (const [slug, agencySnaps] of Object.entries(snapshotData)) {
    if (processedSlugs.has(slug)) continue;
    const registryEntry = registryBySlug.get(slug);
    if (!registryEntry) continue; // snapshot exists for an unknown slug — skip

    const periodKeys = Object.keys(agencySnaps);
    if (periodKeys.length < 2) continue; // need ≥2 distinct service periods

    // Collect all routes that appear in ≥2 periods with different headways
    const routeSnapshots: Record<string, any[]> = {};

    for (const [periodKey, snap] of Object.entries(agencySnaps)) {
      const { year, label } = parsePeriodKey(periodKey);
      for (const [routeShortName, routeData] of Object.entries((snap as any).routes ?? {})) {
        const h = (routeData as any).headway;
        if (h == null) continue;
        if (!routeSnapshots[routeShortName]) routeSnapshots[routeShortName] = [];
        // Deduplicate by year
        if (!routeSnapshots[routeShortName].some(s => s.year === year)) {
          const routeLongName = (routeData as any).routeLongName as string | undefined;
          routeSnapshots[routeShortName].push({ label, year, weekdayHeadwayMin: h, routeLongName });
        }
      }
    }

    const agencyRoutes: any[] = [];
    for (const [routeShortName, snaps] of Object.entries(routeSnapshots)) {
      if (snaps.length < 2) continue;
      snaps.sort((a, b) => a.year - b.year);
      const first = snaps[0];
      const last = snaps[snaps.length - 1];
      if (first.weekdayHeadwayMin === last.weekdayHeadwayMin) continue; // no change — not interesting
      const routeLongName = snaps.find(s => s.routeLongName)?.routeLongName as string | undefined;
      agencyRoutes.push({
        routeShortName,
        routeName: routeLongName || routeShortName,
        snapshots: snaps.map(({ label, year, weekdayHeadwayMin }) => ({ label, year, weekdayHeadwayMin })),
      });
    }

    if (agencyRoutes.length === 0) continue;

    // Sort routes: biggest % change first
    agencyRoutes.sort((a, b) => {
      const pctChange = (r: any[]) => Math.abs(r[r.length - 1].weekdayHeadwayMin / r[0].weekdayHeadwayMin - 1);
      return pctChange(b.snapshots) - pctChange(a.snapshots);
    });

    historyData.push({
      slug,
      name: registryEntry.name,
      region: 'Canada', // All registered agencies are Canadian GTHA agencies for now
      center: registryEntry.center,
      routes: agencyRoutes,
    });

    console.log(`  auto-discovered: ${registryEntry.name} (${agencyRoutes.length} routes with changes)`);
  }

  // 5. Generate TS code for shared/historyConfig.ts
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
