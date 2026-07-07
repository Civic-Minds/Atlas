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
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { config } from 'dotenv';
import { r2ListArchive, r2GetArchive, r2Put } from './r2.js';
import { runWithConcurrency } from './utils.js';
import type { HeadwayByPeriod } from '../shared/config.js';

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
          { periodKey: '20080101', headway: 5 },
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
  // Month-name keys like "Jun-27-2014", "jul-10-2018", "Jun-16-2020"
  const monthNameMatch = key.match(/([A-Za-z]+)[-\s]+(\d+)[-\s]+(20\d{2})/);
  if (monthNameMatch) {
    const year = parseInt(monthNameMatch[3]);
    const monthAbbr = monthNameMatch[1].slice(0, 3);
    const label = `${monthAbbr.charAt(0).toUpperCase()}${monthAbbr.slice(1).toLowerCase()} ${year}`;
    return { year, label };
  }
  // Plain year like "2016"
  const yearOnlyMatch = key.match(/^(20\d{2})$/);
  if (yearOnlyMatch) {
    const year = parseInt(yearOnlyMatch[1]);
    return { year, label: String(year) };
  }
  const yearMatch = key.match(/\b(20\d{2})\b/);
  const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
  return { year, label: key };
}

function getPeriodKeySortValue(key: string): number {
  // YYYYMMDD
  const compact = key.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    return parseInt(compact[1]) * 10000 + parseInt(compact[2]) * 100 + parseInt(compact[3]);
  }
  // YYYY-MM-DD
  const dashed = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dashed) {
    return parseInt(dashed[1]) * 10000 + parseInt(dashed[2]) * 100 + parseInt(dashed[3]);
  }
  // Month-name keys like "Jun-27-2014", "jul-10-2018", "Jun-16-2020", "june-2-2022"
  const monthNameMatch = key.match(/([A-Za-z]+)[-\s]+(\d+)[-\s]+(20\d{2})/);
  if (monthNameMatch) {
    const year = parseInt(monthNameMatch[3]);
    const day = parseInt(monthNameMatch[2]);
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const monthAbbr = monthNameMatch[1].slice(0, 3).toLowerCase();
    const monthIdx = monthNames.indexOf(monthAbbr);
    const month = monthIdx >= 0 ? monthIdx + 1 : 1;
    return year * 10000 + month * 100 + day;
  }
  // Plain year like "2016"
  const yearOnlyMatch = key.match(/^(20\d{2})$/);
  if (yearOnlyMatch) {
    const year = parseInt(yearOnlyMatch[1]);
    return year * 10000 + 101;
  }
  const yearMatch = key.match(/\b(20\d{2})\b/);
  const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
  return year * 10000 + 101;
}

/** Load compact current headways from history/{slug}/latest.json (written by refresh.ts). */
async function loadLatestHeadways(slug: string): Promise<Record<string, { headway: number }>> {
  try {
    const raw = await r2GetArchive(`history/${slug}/latest.json`);
    if (!raw) return {};
    return JSON.parse(raw).routes ?? {};
  } catch {
    return {};
  }
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
    headwayByPeriod?: HeadwayByPeriod;
  }>>> = {};

  const tasks: (() => Promise<void>)[] = [];
  for (const key of keys) {
    const parts = key.split('/');
    // history/{slug}/{routeShortName}/{periodKey}.json → parts.length === 4
    if (parts.length !== 4) continue;
    const [, slug, routeShortName, filename] = parts;
    if (!filename.endsWith('.json')) continue;
    const periodKey = filename.replace('.json', '');

    tasks.push(async () => {
      try {
        const raw = await r2GetArchive(key);
        if (!raw) return;
        const data = JSON.parse(raw);
        const h = data.headway;
        if (h == null) return;
        if (!archiveRoutes[slug]) archiveRoutes[slug] = {};
        if (!archiveRoutes[slug][routeShortName]) archiveRoutes[slug][routeShortName] = [];
        archiveRoutes[slug][routeShortName].push({
          periodKey,
          headway: h,
          routeLongName: data.routeLongName ?? undefined,
          headwayByPeriod: data.headwayByPeriod ?? undefined,
        });
      } catch (err) {
        console.error(`Failed to parse: ${key}`, err);
      }
    });
  }

  console.log(`Downloading ${tasks.length} history snapshot files in parallel (concurrency 50)...`);
  await runWithConcurrency(tasks, 50);

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

  // 3. Load current headways from history/{slug}/latest.json (compact baseline written by refresh.ts).
  //    Much cheaper than fetching full GeoJSONs — latest.json is ~a few KB vs hundreds of KB per agency.
  const slugsWithData = Object.keys(archiveRoutes);
  console.log(`Loading latest headways for ${slugsWithData.length} agencies...`);

  const currentHeadways: Record<string, Record<string, { headway: number }>> = {};
  const headwayTasks = slugsWithData.map(slug => async () => {
    currentHeadways[slug] = await loadLatestHeadways(slug);
  });
  await runWithConcurrency(headwayTasks, 25);

  const currentYear = new Date().getFullYear();
  const historyData: any[] = [];

  // 4. Build per-agency history from per-route change events
  for (const [slug, routeMap] of Object.entries(archiveRoutes)) {
    const registryEntry = registryBySlug.get(slug);
    const current = currentHeadways[slug] ?? {};
    const agencyRoutes: any[] = [];

    for (const [routeShortName, changes] of Object.entries(routeMap)) {
      // Sort change events chronologically
      changes.sort((a, b) => getPeriodKeySortValue(a.periodKey) - getPeriodKeySortValue(b.periodKey));

      // Build snapshot list from archived change events
      const snapshots: Array<{ label: string; year: number; weekdayHeadwayMin: number; headwayByPeriod?: HeadwayByPeriod; geometry?: number[][] }> = changes.map(c => {
        const { year, label } = parsePeriodKey(c.periodKey);
        return { label: c.label ?? label, year, weekdayHeadwayMin: c.headway, headwayByPeriod: c.headwayByPeriod, geometry: c.geometry };
      });

      // Deduplicate: collapse consecutive identical headways (keep first occurrence)
      const deduped = snapshots.filter((s, i) =>
        i === 0 || s.weekdayHeadwayMin !== snapshots[i - 1].weekdayHeadwayMin
      );

      // Add current atlas data as the final point only if headway differs from last snapshot
      const currentRoute = current[routeShortName];
      if (currentRoute) {
        const lastSnap = deduped[deduped.length - 1];
        const alreadyCurrentYear = lastSnap && lastSnap.year === currentYear;
        const headwayChanged = lastSnap && currentRoute.headway !== lastSnap.weekdayHeadwayMin;
        if (!alreadyCurrentYear && headwayChanged) {
          deduped.push({ label: String(currentYear), year: currentYear, weekdayHeadwayMin: currentRoute.headway });
        }
      }

      if (deduped.length < 2) continue;

      // Only include if headway actually changed between first and last
      const first = deduped[0];
      const last = deduped[deduped.length - 1];
      if (first.weekdayHeadwayMin === last.weekdayHeadwayMin) continue;

      const routeLongName = changes.find(c => c.routeLongName)?.routeLongName
        /* routeLongName not in latest.json — comes from archive snapshots only */
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

  // 5. Write history-config.json to public R2 bucket
  await r2Put('atlas/history-config.json', JSON.stringify(historyData));
  console.log(`Generated ${historyData.length} agencies → atlas/history-config.json (R2)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
