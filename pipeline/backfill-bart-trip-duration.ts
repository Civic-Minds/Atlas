/**
 * BART trip-duration history — pilot for the trip-time-over-years experiment
 * (see docs/roadmap/EXPERIMENTS.md).
 *
 * Re-parses every archived BART GTFS zip in atlas-archive (gtfs/archive/bart/),
 * computes a representative weekday trip's duration + stop sequence per rail
 * route/period via computeRailTripDurations, and reports each period's
 * stability against the previous one (raw and parent-normalized stop
 * sequence match).
 *
 * Report mode (default) makes no R2 writes. --write mode additionally writes
 * one archive file per route per period to trip-duration/bart/{routeKey}/{periodKey}.json
 * in the private atlas-archive bucket — a prefix that is never read by the
 * existing history/ listing in build-history.ts, so this cannot collide with
 * or overwrite existing headway history snapshots.
 *
 * Run: npx tsx pipeline/backfill-bart-trip-duration.ts [--write]
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import './loadEnv.js';
import { r2ListArchive, r2GetArchiveBuffer, r2PutArchiveJson } from './r2.js';
import { parseGtfsZip } from './parseGtfs.js';
import { normalizeGtfs, type GtfsTransformOptions } from './preprocess/run.js';
import { effectiveFeedExpiry } from './feedFreshness.js';
import { computeRailTripDurations, type RouteTripDuration } from './trip-duration.js';

const SLUG = 'bart';
const write = process.argv.includes('--write');

interface AgencyEntry extends GtfsTransformOptions {
  slug: string;
}

function sanitizeLabel(s: string | null | undefined): string {
  return (s ?? 'unknown').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'unknown';
}

/** Best-effort period key when the feed itself has no usable expiry/version. */
function fallbackPeriodKeyFromFilename(key: string): string {
  const stem = key.split('/').pop()!.replace(/\.zip$/, '');
  // Strip a trailing "-<16 hex chars>" content-hash suffix, if present (routine
  // refresh.ts archive writes append one; one-off backfill writes don't).
  return stem.replace(/-[0-9a-f]{16}$/, '');
}

interface PeriodResult {
  periodKey: string;
  key: string;
  routes: RouteTripDuration[];
}

async function main() {
  const indexPath = resolve('public/data/index.json');
  const index = JSON.parse(readFileSync(indexPath, 'utf8')) as { agencies: AgencyEntry[] };
  const agency = index.agencies.find(a => a.slug === SLUG);
  if (!agency) throw new Error(`${SLUG} not found in public/data/index.json`);

  const keys = await r2ListArchive(`gtfs/archive/${SLUG}/`);
  console.log(`Found ${keys.length} archived zips for ${SLUG}.`);

  const periods: PeriodResult[] = [];

  for (const key of keys) {
    const buf = await r2GetArchiveBuffer(key);
    if (!buf) {
      console.log(`  [skip] ${key} — fetch failed`);
      continue;
    }

    try {
      let gtfs = await parseGtfsZip(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
      gtfs = normalizeGtfs(gtfs, agency);

      const periodKey = effectiveFeedExpiry({
        feedInfoEnd: gtfs.feedInfo?.[0]?.feed_end_date,
        calendarEnds: (gtfs.calendar ?? []).map(c => c.end_date),
        calendarDates: gtfs.calendarDates,
      }) ?? gtfs.feedInfo?.[0]?.feed_version ?? fallbackPeriodKeyFromFilename(key);

      const routes = computeRailTripDurations(gtfs, SLUG);
      periods.push({ periodKey: sanitizeLabel(periodKey), key, routes });
      console.log(`  ${key} -> period ${periodKey}, ${routes.length} rail route(s)`);
    } catch (err) {
      console.log(`  [skip] ${key} — ${err instanceof Error ? err.message : err}`);
    }
  }

  periods.sort((a, b) => a.periodKey.localeCompare(b.periodKey));

  // Group by routeKey across periods, chronological order.
  const byRoute = new Map<string, Array<{ periodKey: string; data: RouteTripDuration }>>();
  for (const period of periods) {
    for (const route of period.routes) {
      if (!byRoute.has(route.routeKey)) byRoute.set(route.routeKey, []);
      byRoute.get(route.routeKey)!.push({ periodKey: period.periodKey, data: route });
    }
  }

  console.log('\n--- Stability report (vs. previous period) ---');
  for (const [routeKey, entries] of [...byRoute.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`\n${routeKey} (${entries.length} period(s)):`);
    for (let i = 0; i < entries.length; i++) {
      const { periodKey, data } = entries[i];
      if (i === 0) {
        console.log(`  ${periodKey}: ${data.durationMinutes} min, ${data.stopSequenceRaw.length} stops (baseline)`);
        continue;
      }
      const prev = entries[i - 1].data;
      const rawMatch = JSON.stringify(prev.stopSequenceRaw) === JSON.stringify(data.stopSequenceRaw);
      const normMatch = JSON.stringify(prev.stopSequenceNormalized) === JSON.stringify(data.stopSequenceNormalized);
      console.log(
        `  ${periodKey}: ${data.durationMinutes} min, ${data.stopSequenceRaw.length} stops` +
        ` — raw ${rawMatch ? 'match' : 'CHANGED'}, normalized ${normMatch ? 'match' : 'CHANGED'}`,
      );
    }
  }

  if (!write) {
    console.log('\nReport mode only (pass --write to persist to atlas-archive).');
    return;
  }

  console.log('\nWriting to atlas-archive under trip-duration/bart/ ...');
  let written = 0;
  for (const [routeKey, entries] of byRoute) {
    for (const { periodKey, data } of entries) {
      const archiveKey = `trip-duration/${SLUG}/${routeKey}/${periodKey}.json`;
      await r2PutArchiveJson(archiveKey, JSON.stringify({
        routeId: data.routeId,
        routeLongName: data.routeLongName,
        directionId: data.directionId,
        representativeTripId: data.representativeTripId,
        representativeShapeId: data.representativeShapeId,
        departureTime: data.departureTime,
        durationMinutes: data.durationMinutes,
        stopSequence: data.stopSequenceNormalized,
        stopSequenceRaw: data.stopSequenceRaw,
        processedAt: new Date().toISOString(),
      }));
      written++;
    }
  }
  console.log(`Wrote ${written} file(s).`);
}

main().catch(err => { console.error(err); process.exit(1); });
