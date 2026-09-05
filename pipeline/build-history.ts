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
 * differs from current atlas data. Lightweight history/{slug}/coverage.json
 * metadata can add covered schedule years without duplicating unchanged route
 * snapshots. BASE_HISTORY handles manual case-study data (e.g. GCRTA
 * pre-pipeline snapshots).
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { config } from 'dotenv';
import { r2ListArchive, r2GetArchive, r2Get, r2Put } from './r2.js';
import { runWithConcurrency } from './utils.js';
import { resolveCurrentHistoryRoute } from './historyIdentity.js';
import { historyRouteKey } from './historyRouteKey.js';
import type { HeadwayByPeriod } from '../shared/config.js';

config({ path: resolve('.env.local') });

const dryRun = process.argv.includes('--dry-run');

// Manually seeded historical data for agencies with pre-pipeline snapshots.
// Each entry is written as if it came from atlas-archive: { headway, routeLongName, label? }.
const BASE_HISTORY: Array<{
  slug: string;
  routes: Array<{
      routeShortName: string;
      routeLongName: string;
      currentRouteShortNames?: string[];
      snapshots: Array<{ periodKey: string; headway: number; label?: string }>;
  }>;
}> = [
  {
    slug: 'gcrta',
    routes: [
      {
        routeShortName: 'HealthLine',
        routeLongName: 'Euclid Avenue BRT',
        currentRouteShortNames: ['HL'],
        snapshots: [
          { periodKey: '20080101', headway: 5 },
        ],
      },
    ],
  },
  {
    slug: 'nfta',
    routes: [
      {
        routeShortName: '45',
        routeLongName: 'METRO RAIL',
        currentRouteShortNames: ['145'],
        snapshots: [],
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

/** Load current route facts from the public Atlas artifact, not the archive baseline. */
async function loadCurrentHeadways(slug: string): Promise<Record<string, {
  headway: number;
  routeLongName?: string;
  headwayByPeriod?: HeadwayByPeriod;
  geometry?: number[][];
}>> {
  try {
    const raw = await r2Get(`atlas/${slug}.json`);
    if (!raw) return {};
    const fc = JSON.parse(raw) as { features?: Array<{ geometry?: { coordinates?: number[][] }; properties?: Record<string, unknown> }> };
    const current: Record<string, {
      headway: number;
      routeLongName?: string;
      headwayByPeriod?: HeadwayByPeriod;
      geometry?: number[][];
    }> = {};
    for (const feature of fc.features ?? []) {
      const p = feature.properties;
      if (p?.day !== 'Weekday' || p.directionId !== 0 || p.headway == null) continue;
      const routeShortName = historyRouteKey(p);
      if (!routeShortName) continue;
      const headway = Number(p.headway);
      if (!Number.isFinite(headway)) continue;
      if (!current[routeShortName] || headway < current[routeShortName].headway) {
        current[routeShortName] = {
          headway,
          routeLongName: p.routeLongName ? String(p.routeLongName) : undefined,
          headwayByPeriod: p.headwayByPeriod as HeadwayByPeriod | undefined,
          geometry: feature.geometry?.coordinates,
        };
      }
    }
    return current;
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

  // 1b. List trip-duration files: trip-duration/{slug}/{routeKey}/{periodKey}.json
  // (separate prefix from history/ so this can never collide with or overwrite
  // a headway snapshot file — see pipeline/backfill-bart-trip-duration.ts)
  const tripDurationKeys = await r2ListArchive('trip-duration/');
  console.log(`Found ${tripDurationKeys.length} files in atlas-archive/trip-duration/`);
  const tripDurationRoutes: Record<string, Record<string, Array<{
    periodKey: string; durationMinutes: number; stopSequence: string[];
  }>>> = {};
  const tripDurationTasks: (() => Promise<void>)[] = [];
  for (const key of tripDurationKeys) {
    const parts = key.split('/');
    if (parts.length !== 4 || !parts[3].endsWith('.json')) continue;
    const [, slug, routeKey, filename] = parts;
    const periodKey = filename.replace('.json', '');
    tripDurationTasks.push(async () => {
      try {
        const raw = await r2GetArchive(key);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (typeof data.durationMinutes !== 'number' || !Array.isArray(data.stopSequence)) return;
        if (!tripDurationRoutes[slug]) tripDurationRoutes[slug] = {};
        if (!tripDurationRoutes[slug][routeKey]) tripDurationRoutes[slug][routeKey] = [];
        tripDurationRoutes[slug][routeKey].push({
          periodKey,
          durationMinutes: data.durationMinutes,
          stopSequence: data.stopSequence,
        });
      } catch (err) {
        console.error(`Failed to parse: ${key}`, err);
      }
    });
  }
  await runWithConcurrency(tripDurationTasks, 50);
  for (const routes of Object.values(tripDurationRoutes)) {
    for (const entries of Object.values(routes)) {
      entries.sort((a, b) => getPeriodKeySortValue(a.periodKey) - getPeriodKeySortValue(b.periodKey));
    }
  }

  // Map: slug → routeShortName → sorted array of change events
  const archiveRoutes: Record<string, Record<string, Array<{
    periodKey: string; headway: number; routeLongName?: string; label?: string;
    headwayByPeriod?: HeadwayByPeriod;
  }>>> = {};
  const coverageBySlug: Record<string, { coverageYears: number[]; materializeAllPeriods?: boolean }> = {};

  const tasks: (() => Promise<void>)[] = [];
  for (const key of keys) {
    const parts = key.split('/');
    if (parts.length === 3 && parts[0] === 'history' && parts[2] === 'coverage.json') {
      tasks.push(async () => {
        try {
          const raw = await r2GetArchive(key);
          const metadata = JSON.parse(raw ?? '{}');
          const years = metadata.coverageYears;
          if (Array.isArray(years)) {
            coverageBySlug[parts[1]] = {
              coverageYears: years.filter((year): year is number => Number.isInteger(year)),
              materializeAllPeriods: metadata.materializeAllPeriods === true,
            };
          }
        } catch (err) {
          console.error(`Failed to parse coverage metadata: ${key}`, err);
        }
      });
      continue;
    }
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

  // 3. Load current headways from the public Atlas artifact. This keeps the
  // history endpoint aligned with the current map after route redesigns or
  // refreshes, rather than trusting the archive diff baseline.
  const slugsWithData = Object.keys(archiveRoutes);
  console.log(`Loading latest headways for ${slugsWithData.length} agencies...`);

  const currentHeadways: Record<string, Record<string, Awaited<ReturnType<typeof loadCurrentHeadways>>[string]>> = {};
  const headwayTasks = slugsWithData.map(slug => async () => {
    currentHeadways[slug] = await loadCurrentHeadways(slug);
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

      const materializeAllPeriods = coverageBySlug[slug]?.materializeAllPeriods === true;
      // Normal history is change-only. The period-materialization experiment
      // deliberately keeps each archived period so the scrubber can land on
      // a documented schedule even when the route's headway is unchanged.
      const deduped = materializeAllPeriods
        ? [...snapshots]
        : snapshots.filter((s, i) =>
            i === 0 || s.weekdayHeadwayMin !== snapshots[i - 1].weekdayHeadwayMin
          );

      // Add current Atlas data as the final point whenever it is newer than
      // the archive. Even an unchanged headway gets a current endpoint when
      // the route has a meaningful historical series.
      const manualRoute = BASE_HISTORY
        .find(a => a.slug === slug)?.routes
        .find(r => r.routeShortName === routeShortName);
      const currentRoute = resolveCurrentHistoryRoute(
        { routeShortName, currentRouteShortNames: manualRoute?.currentRouteShortNames },
        current,
      );
      if (currentRoute) {
        const lastSnap = deduped[deduped.length - 1];
        const alreadyCurrentYear = lastSnap && lastSnap.year === currentYear;
        if (!alreadyCurrentYear) {
          deduped.push({
            label: String(currentYear),
            year: currentYear,
            weekdayHeadwayMin: currentRoute.headway,
            headwayByPeriod: currentRoute.headwayByPeriod,
            geometry: currentRoute.geometry,
          });
        }
      }

      // Independent trip-duration comparison: only attaches when the route's
      // stop sequence was identical across every archived period being
      // compared. Never a caveat when unstable -- just omitted, so a rider
      // never sees a comparison that might be comparing two different
      // physical alignments (see docs/roadmap/EXPERIMENTS.md).
      // De-dupe by periodKey (routine weekly refreshes can archive the same
      // service period more than once) before looking for a stable run.
      const rawTripDurationEntries = tripDurationRoutes[slug]?.[routeShortName] ?? [];
      const tripDurationEntries = rawTripDurationEntries.filter((entry, i) =>
        i === 0 || entry.periodKey !== rawTripDurationEntries[i - 1].periodKey,
      );

      let tripDuration: { firstLabel: string; firstMinutes: number; lastLabel: string; lastMinutes: number } | undefined;
      if (tripDurationEntries.length >= 2) {
        // Requiring the *entire* archive to match is unrealistic -- agencies
        // relabel stop/platform IDs over a decade+ of history (confirmed:
        // BART did this around Jan 2026) without the physical alignment
        // actually changing, and the conservative exact-match rule can't
        // tell that apart from a real change. So instead of the whole range,
        // use the longest trailing run of periods (ending at the newest)
        // that all share an identical stop sequence -- i.e. "how long has
        // today's alignment been unchanged," which is also the more useful
        // comparison for a rider than an arbitrary older baseline.
        let start = tripDurationEntries.length - 1;
        while (
          start > 0 &&
          JSON.stringify(tripDurationEntries[start - 1].stopSequence) === JSON.stringify(tripDurationEntries[start].stopSequence)
        ) {
          start--;
        }
        const stableRun = tripDurationEntries.slice(start);
        if (stableRun.length >= 2) {
          const firstEntry = stableRun[0];
          const lastEntry = stableRun[stableRun.length - 1];
          tripDuration = {
            firstLabel: parsePeriodKey(firstEntry.periodKey).label,
            firstMinutes: firstEntry.durationMinutes,
            lastLabel: parsePeriodKey(lastEntry.periodKey).label,
            lastMinutes: lastEntry.durationMinutes,
          };
        }
      }

      // Always require at least 2 snapshot points structurally -- the History
      // UI's oldest-vs-newest display needs a real range regardless of
      // whether a trip-duration comparison also exists for this route.
      if (deduped.length < 2) continue;

      // Only include if headway actually changed between first and last in
      // normal change-only mode. Materialized periods are intentionally kept
      // even when a route's value stayed constant across the archive. A
      // stable trip-duration comparison is also reason enough to keep a
      // route whose headway itself never changed.
      const first = deduped[0];
      const last = deduped[deduped.length - 1];
      if (!materializeAllPeriods && !tripDuration && first.weekdayHeadwayMin === last.weekdayHeadwayMin) continue;

      const routeLongName = currentRoute?.routeLongName
        ?? changes.find(c => c.routeLongName)?.routeLongName
        ?? routeShortName;

      agencyRoutes.push({ routeShortName, routeName: routeLongName, snapshots: deduped, tripDuration });
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

    historyData.push({
      slug,
      name,
      region,
      center,
      coverageYears: coverageBySlug[slug]?.coverageYears,
      routes: agencyRoutes,
    });
    console.log(`  ${name}: ${agencyRoutes.length} routes with changes`);
  }

  // 5. Write history-config.json to public R2 bucket
  if (dryRun) {
    const outPath = resolve('tmp/history-config.dry-run.json');
    writeFileSync(outPath, JSON.stringify(historyData, null, 2));
    console.log(`Dry run — wrote ${historyData.length} agencies to ${outPath} instead of R2.`);
    return;
  }
  await r2Put('atlas/history-config.json', JSON.stringify(historyData));
  console.log(`Generated ${historyData.length} agencies → atlas/history-config.json (R2)`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
