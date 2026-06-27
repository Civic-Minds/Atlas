#!/usr/bin/env npx tsx
/**
 * build-history.ts — compile generated and manual history configurations.
 * Usage: npm run build-history
 */
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { config } from 'dotenv';
import { r2ListArchive, r2GetArchive } from './r2.js';

config({ path: resolve('.env.local') });

interface BaseAgencyHistory {
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

const BASE_HISTORY: BaseAgencyHistory[] = [
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
          { label: '2026', year: 2026, weekdayHeadwayMin: 15 }, // Fallback in case R2 lacks it
        ],
      },
    ],
  },
  {
    slug: 'burlington',
    name: 'Burlington Transit',
    region: 'Ontario',
    center: [43.3256, -79.7997],
    routes: [
      {
        routeShortName: '1',
        routeName: 'Plains-Fairview',
        manualSnapshots: [],
      },
    ],
  },
];

function parsePeriodKey(key: string) {
  // Check if it matches YYYY-MM-DD or similar date shape
  const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const year = parseInt(match[1]);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[parseInt(match[2]) - 1] ?? '';
    return { year, label: `${month} ${year}` };
  }
  
  // Fallback to first 4-digit number
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

  // 1. List all keys under history/ in the archive bucket
  const keys = await r2ListArchive('history/');
  console.log(`Found ${keys.length} snapshot files in R2`);

  // Map of agency_slug -> period_key -> parsed routes data
  const snapshotData: Record<string, Record<string, any>> = {};

  // 2. Fetch and parse each snapshot in parallel
  await Promise.all(
    keys.map(async key => {
      // Keys are history/{slug}/{periodKey}.json
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

  // 3. Merge base config and R2 snapshot data
  const historyData = [];

  for (const agency of BASE_HISTORY) {
    const agencyRoutes = [];

    for (const route of agency.routes) {
      const manualSnapshots = [...route.manualSnapshots];
      const manualYears = new Set(manualSnapshots.map(s => s.year));

      // Aggregate dynamic snapshots from R2 data
      const dynamicSnapshots = [];
      const agencySnaps = snapshotData[agency.slug] ?? {};

      for (const [periodKey, snap] of Object.entries(agencySnaps)) {
        const routeData = snap.routes?.[route.routeShortName];
        if (routeData && routeData.headway != null) {
          const { year, label } = parsePeriodKey(periodKey);
          
          // Skip if we already have a manual snapshot for this year
          if (manualYears.has(year)) continue;

          dynamicSnapshots.push({
            label,
            year,
            weekdayHeadwayMin: routeData.headway,
          });
        }
      }

      // Sort dynamic snapshots by year ascending and deduplicate if same year appears twice
      dynamicSnapshots.sort((a, b) => a.year - b.year);
      const uniqueDynamic: typeof dynamicSnapshots = [];
      for (const snap of dynamicSnapshots) {
        if (!uniqueDynamic.some(s => s.year === snap.year)) {
          uniqueDynamic.push(snap);
        }
      }

      const mergedSnapshots = [...manualSnapshots, ...uniqueDynamic];
      mergedSnapshots.sort((a, b) => a.year - b.year);

      agencyRoutes.push({
        routeShortName: route.routeShortName,
        routeName: route.routeName,
        snapshots: mergedSnapshots,
      });
    }

    historyData.push({
      slug: agency.slug,
      name: agency.name,
      region: agency.region,
      center: agency.center,
      routes: agencyRoutes,
    });
  }

  // 4. Generate TS code for shared/historyConfig.ts
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
  console.log(`Successfully generated history configuration at ${outputPath}`);
}

main().catch(console.error);
