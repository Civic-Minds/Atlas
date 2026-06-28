#!/usr/bin/env npx tsx
/**
 * build-history.ts — compile generated and manual history configurations.
 * Usage: npm run build-history
 *
 * Data sources:
 *   atlas-archive  history/{slug}/{routeShortName}/{feed_end_date}.json
 *                  → written by refresh.ts only when a route's headway changes
 *   atlas (public) atlas/{slug}.json
 *                  → current headways; used as the final data point
 *
 * Agencies auto-appear once they have ≥1 route with a recorded change that
 * differs from current atlas data. BASE_HISTORY handles manual case-study data
 * (e.g. GCRTA pre-pipeline snapshots).
 */
import { writeFileSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { config } from 'dotenv';
import { r2Get, r2ListArchive, r2GetArchive } from './r2.js';

config({ path: resolve('.env.local') });

// Manually seeded historical data for agencies with pre-pipeline snapshots.
// Each entry is written as if it came from atlas-archive: { headway, routeLongName, label? }.
const BASE_HISTORY: Array<{
  slug: string;
  routes: Array<{
    routeShortName: string;
    routeLongName: string;
    snapshots: Array<{ periodKey: string; headway: number; label?: string }>;
  }>;
}> = [
  {
    slug: 'gcrta',
    routes: [
      {
        routeShortName: 'HealthLine',
        routeLongName: 'Euclid Avenue BRT',
        snapshots: [
          { periodKey: '20080101', headway: 5, label: '2008 Launch' },
          { periodKey: '20160101', headway: 7.5, label: '2016' },
        ],
      },
    ],
  },
];

function parsePeriodKey(key: string): { year: number; label: string } {
  // YYYYMMDD
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
  const yearMatch = key.match(/\b(20\d{2})\b/);
  const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
  return { year, label: key };
}

/** Extract compact route → headway map from a full agency GeoJSON. */
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
  const index: { agencies: Array<{ slug: string; name: string; region?: string; center: [number, number] }> } =
    JSON.parse(readFileSync(indexPath, 'utf8'));
  const registryBySlug = new Map(index.agencies.map(a => [a.slug, a]));

  // 1. List all per-route change files: history/{slug}/{routeShortName}/{periodKey}.json
  const keys = await r2ListArchive('history/');
  console.log(`Found ${keys.length} files in atlas-archive/history/`);

  // Map: slug → routeShortName → sorted array of change events
  const archiveRoutes: Record<string, Record<string, Array<{
    periodKey: string; headway: number; routeLongName?: string; label?: string;
  }>>> = {};

  for (const key of keys) {
    const parts = key.split('/');
    // history/{slug}/{routeShortName}/{periodKey}.json → parts.length === 4
    if (parts.length !== 4) continue;
    const [, slug, routeShortName, filename] = parts;
    if (!filename.endsWith('.json')) continue;
    const periodKey = filename.replace('.json', '');

    try {
      const raw = await r2GetArchive(key);
      if (!raw) continue;
      const data = JSON.parse(raw);
      const h = data.headway;
      if (h == null) continue;
      if (!archiveRoutes[slug]) archiveRoutes[slug] = {};
      if (!archiveRoutes[slug][routeShortName]) archiveRoutes[slug][routeShortName] = [];
      archiveRoutes[slug][routeShortName].push({
        periodKey,
        headway: h,
        routeLongName: data.routeLongName ?? undefined,
      });
    } catch (err) {
      console.error(`Failed to parse: ${key}`, err);
    }
  }

  // 2. Merge BASE_HISTORY manual seeds into archiveRoutes
  for (const agency of BASE_HISTORY) {
    if (!archiveRoutes[agency.slug]) archiveRoutes[agency.slug] = {};
    for (const route of agency.routes) {
      if (!archiveRoutes[agency.slug][route.routeShortName]) {
        archiveRoutes[agency.slug][route.routeShortName] = [];
      }
      for (const snap of route.snapshots) {
        const exists = archiveRoutes[agency.slug][route.routeShortName].some(e => e.periodKey === snap.periodKey);
        if (!exists) {
          archiveRoutes[agency.slug][route.routeShortName].push({
            periodKey: snap.periodKey,
            headway: snap.headway,
            routeLongName: route.routeLongName,
            label: snap.label,
          });
        }
      }
    }
  }

  // 3. Fetch current GeoJSON from atlas for slugs that have archive data
  const slugsWithData = Object.keys(archiveRoutes);
  console.log(`Fetching current GeoJSON for ${slugsWithData.length} agencies...`);

  const currentHeadways: Record<string, Record<string, { headway: number; routeLongName?: string }>> = {};
  await Promise.all(
    slugsWithData.map(async slug => {
      try {
        const raw = await r2Get(`atlas/${slug}.json`);
        if (!raw) return;
        currentHeadways[slug] = extractCurrentHeadways(JSON.parse(raw));
      } catch { /* agency may not be in atlas bucket */ }
    })
  );

  const currentYear = new Date().getFullYear();
  const historyData: any[] = [];

  // 4. Build per-agency history from per-route change events
  for (const [slug, routeMap] of Object.entries(archiveRoutes)) {
    const registryEntry = registryBySlug.get(slug);
    const current = currentHeadways[slug] ?? {};
    const agencyRoutes: any[] = [];

    for (const [routeShortName, changes] of Object.entries(routeMap)) {
      // Sort change events chronologically
      changes.sort((a, b) => a.periodKey.localeCompare(b.periodKey));

      // Build snapshot list from archived change events
      const snapshots: Array<{ label: string; year: number; weekdayHeadwayMin: number }> = changes.map(c => {
        const { year, label } = parsePeriodKey(c.periodKey);
        return { label: c.label ?? label, year, weekdayHeadwayMin: c.headway };
      });

      // Deduplicate: collapse consecutive identical headways (keep first occurrence)
      const deduped = snapshots.filter((s, i) =>
        i === 0 || s.weekdayHeadwayMin !== snapshots[i - 1].weekdayHeadwayMin
      );

      // Add current atlas data as the final point if not already this year
      const currentRoute = current[routeShortName];
      if (currentRoute) {
        const lastSnap = deduped[deduped.length - 1];
        const alreadyCurrentYear = lastSnap && lastSnap.year === currentYear;
        if (!alreadyCurrentYear) {
          deduped.push({ label: String(currentYear), year: currentYear, weekdayHeadwayMin: currentRoute.headway });
        }
      }

      if (deduped.length < 2) continue;

      // Only include if headway actually changed between first and last
      const first = deduped[0];
      const last = deduped[deduped.length - 1];
      if (first.weekdayHeadwayMin === last.weekdayHeadwayMin) continue;

      const routeLongName = changes.find(c => c.routeLongName)?.routeLongName
        ?? currentRoute?.routeLongName
        ?? routeShortName;

      agencyRoutes.push({ routeShortName, routeName: routeLongName, snapshots: deduped });
    }

    if (agencyRoutes.length === 0) continue;

    // Sort routes by magnitude of change (biggest % shift first)
    agencyRoutes.sort((a, b) => {
      const pct = (r: any[]) => Math.abs(r[r.length - 1].weekdayHeadwayMin / r[0].weekdayHeadwayMin - 1);
      return pct(b.snapshots) - pct(a.snapshots);
    });

    const name = registryEntry?.name ?? slug;
    const region = registryEntry?.region ?? '';
    const center = registryEntry?.center;

    historyData.push({ slug, name, region, center, routes: agencyRoutes });
    console.log(`  ${name}: ${agencyRoutes.length} routes with changes`);
  }

  // 5. Write shared/historyConfig.ts
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
