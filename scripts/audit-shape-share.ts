#!/usr/bin/env npx tsx
/**
 * CIV-1657 (CIV-1138, #771, #1211). Report only: lists every direction whose drawn shape carries
 * under half of its headsign's trips while its headline reads slower than its own time-of-day
 * value (see pipeline/shapeShareCheck.ts). It reads the published release and GTFS zips and
 * writes only the report named with --out; it never writes to R2 or changes an artifact.
 *
 * 1. Published data: every row whose headline is slower than its midday value (or its fastest
 *    daytime period when it has no midday value). Most rows pass here, so few feeds are read.
 * 2. GTFS: for each such row, the headsign's trips on the day are counted by shape, and the
 *    drawn shape is the one whose stops match the row's stopOrder. Its share decides the flag.
 *
 *
 * The feed is <feeds-dir>/<slug>.zip when given, else the agency's feedUrl. A feed whose
 * feed_version differs from the version the registry recorded is skipped (it is not the feed the
 * release was built from), never guessed. Feeds with API keys or supplementals are read as the
 * main feed only.
 *
 * Run:
 *   npm run audit-shape-share -- [--release <id>] [--only-slug <slug> ...] [--feeds-dir <dir>] [--out <file.json>]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseGtfsZip } from '../pipeline/parseGtfs.js';
import { normalizeGtfs, type GtfsTransformOptions } from '../pipeline/preprocess/run.js';
import { readWeekOf } from '../pipeline/readWeek.js';
import { getActiveServiceIds } from '../pipeline/transit-calendar.js';
import { serviceAnchor } from '../pipeline/serviceDays.js';
import { R2_PUBLIC_URL } from '../shared/config.js';
import { WEEKDAYS, type DayName } from '../shared/dayTypes.js';
import {
  checkShapeShare,
  drawnShapeShare,
  formatShapeShareLine,
  headlineSlowerThanPeriods,
  stopIdsByTrip,
  type ShapeShareReportRow,
} from '../pipeline/shapeShareCheck.js';

type Obj = Record<string, any>;
const argv = process.argv.slice(2);
const many = (name: string) => argv.flatMap((a, i) => (a === name && argv[i + 1] ? [argv[i + 1]] : []));
const one = (name: string) => many(name)[0];
const onlySlugs = new Set(many('--only-slug'));
const feedsDir = one('--feeds-dir');
const outPath = one('--out');

async function getJson(url: string): Promise<Obj | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  const text = await res.text();
  try { return JSON.parse(text); } catch { return null; }
}

function daysFor(day: string): DayName[] {
  if (day === 'Weekday') return WEEKDAYS;
  if (day === 'Saturday' || day === 'Sunday') return [day];
  return [];
}

async function loadFeed(agency: Obj): Promise<{ buf: Buffer } | { skip: string }> {
  const local = feedsDir ? resolve(feedsDir, `${agency.slug}.zip`) : null;
  if (local && existsSync(local)) return { buf: readFileSync(local) };
  const url: string | undefined = agency.feedUrl;
  if (!url) return { skip: 'no feedUrl' };
  if (/[{}]|api[_-]?key|token=/i.test(url)) return { skip: 'feed needs a key' };
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) return { skip: `feed download ${res.status}` };
    return { buf: Buffer.from(await res.arrayBuffer()) };
  } catch (error) {
    return { skip: `feed download failed (${error instanceof Error ? error.message : String(error)})` };
  }
}

async function main() {
  const pointer = await getJson(`${R2_PUBLIC_URL}/atlas/release.json`);
  const releaseId = one('--release') ?? pointer?.releaseId;
  if (!releaseId) throw new Error('No release id: pass --release or check atlas/release.json');
  const prefix = `atlas/releases/${releaseId}/agencies`;
  const generatedAt: string = pointer?.releaseId === releaseId ? pointer.generatedAt : new Date().toISOString();
  const anchor = serviceAnchor(generatedAt.slice(0, 10).replace(/-/g, ''));

  const index = JSON.parse(readFileSync(resolve('public/data/index.json'), 'utf8'));
  const agencies: Obj[] = (Array.isArray(index) ? index : index.agencies).filter((a: Obj) => onlySlugs.size === 0 || onlySlugs.has(a.slug));

  const flagged: ShapeShareReportRow[] = [];
  const skipped: Array<{ slug: string; row?: string; reason: string }> = [];
  let candidates = 0;
  let checked = 0;

  for (const agency of agencies) {
    const geo = await getJson(`${R2_PUBLIC_URL}/${prefix}/${agency.slug}.json`);
    if (!geo?.features) continue;
    const rows = (geo.features as Obj[]).map(f => f.properties as Obj)
      .filter(p => p && !p.isCorridor && Array.isArray(p.stopOrder) && p.stopOrder.length > 1
        && headlineSlowerThanPeriods(p.headway, p.headwayByPeriod));
    if (rows.length === 0) continue;
    candidates += rows.length;
    const feed = await loadFeed(agency);
    if ('skip' in feed) {
      skipped.push({ slug: agency.slug, reason: `${feed.skip} (${rows.length} rows)` });
      continue;
    }
    let gtfs;
    try {
      gtfs = await parseGtfsZip(feed.buf.buffer.slice(feed.buf.byteOffset, feed.buf.byteOffset + feed.buf.byteLength) as ArrayBuffer, undefined, { agencySlug: agency.slug });
      gtfs = normalizeGtfs(gtfs, agency as GtfsTransformOptions);
    } catch (error) {
      skipped.push({ slug: agency.slug, reason: `feed parse failed (${error instanceof Error ? error.message : String(error)})` });
      continue;
    }
    const version = gtfs.feedInfo?.[0]?.feed_version?.trim() || null;
    if (agency.lastFeedVersion && version && version !== agency.lastFeedVersion) {
      skipped.push({ slug: agency.slug, reason: `feed version ${version} is not the release's ${agency.lastFeedVersion} (${rows.length} rows)` });
      continue;
    }
    const week = readWeekOf(gtfs, { anchor, fileDate: agency.feedObtainedAt ?? null });
    const activeByDay = new Map<DayName, Set<string>>();
    const active = (d: DayName) => {
      let s = activeByDay.get(d);
      if (!s) activeByDay.set(d, (s = getActiveServiceIds(week.calendar, week.calendarDates, d, week.referenceDate)));
      return s;
    };
    const routeIdsByShortName = new Map<string, Set<string>>();
    for (const r of gtfs.routes) {
      const key = r.route_short_name?.trim() || r.route_id;
      const set = routeIdsByShortName.get(key) ?? new Set<string>();
      set.add(r.route_id);
      routeIdsByShortName.set(key, set);
    }
    const parentOf = new Map(gtfs.stops.filter(s => s.parent_station).map(s => [s.stop_id, s.parent_station!]));
    const neededRoutes = new Set<string>();
    const routeIdsFor = (p: Obj) => {
      const byId = gtfs.routes.some(r => r.route_id === p.routeId) ? new Set([p.routeId as string]) : null;
      return byId ?? routeIdsByShortName.get(p.routeShortName) ?? new Set<string>();
    };
    for (const p of rows) for (const id of routeIdsFor(p)) neededRoutes.add(id);
    const tripIds = new Set(gtfs.trips.filter(t => neededRoutes.has(t.route_id)).map(t => t.trip_id));
    const stopsByTrip = stopIdsByTrip(gtfs.stopTimes, tripIds);

    for (const p of rows) {
      const label = `${p.routeShortName} d${p.directionId} ${p.day} ${p.headsign ?? ''}`;
      let best: ReturnType<typeof drawnShapeShare> | null = null;
      for (const d of daysFor(p.day)) {
        const r = drawnShapeShare({
          trips: gtfs.trips, stopIdsByTrip: stopsByTrip, activeServiceIds: active(d), routeIds: routeIdsFor(p),
          directionId: Number(p.directionId ?? 0), headsign: p.headsign, stopOrder: p.stopOrder, parentOf,
        });
        // A weekday row reads the weekday its headsign runs most.
        if (best == null || (r.ok && (!best.ok || r.value.headsignTrips > best.value.headsignTrips))) best = r;
      }
      if (!best || !best.ok) {
        skipped.push({ slug: agency.slug, row: label, reason: best ? best.reason : `day ${p.day} not read` });
        continue;
      }
      checked++;
      const flag = checkShapeShare({ headway: p.headway, headwayByPeriod: p.headwayByPeriod, drawnShapeTrips: best.value.drawnShapeTrips, headsignTrips: best.value.headsignTrips });
      if (flag) flagged.push({
        ...flag, slug: agency.slug, route: p.routeShortName, directionId: Number(p.directionId ?? 0), day: p.day,
        headsign: p.headsign ?? null, drawnShapeId: best.value.drawnShapeId, shapes: best.value.shapes,
      });
    }
    process.stdout.write(`  ${agency.slug}: ${rows.length} slower-headline rows read\n`);
  }

  flagged.sort((a, b) => b.ratio - a.ratio || a.share - b.share);
  const summary = {
    releaseId,
    candidates,
    checked,
    flagged: flagged.length,
    flaggedAgencies: new Set(flagged.map(f => f.slug)).size,
    skippedAgencies: new Set(skipped.filter(s => !s.row).map(s => s.slug)).size,
    skippedRows: skipped.filter(s => s.row).length,
  };
  console.log(`\nShape share check (report only) on ${releaseId}: ${summary.flagged} flagged in ${summary.flaggedAgencies} agencies; `
    + `${summary.candidates} rows read slower than their periods, ${summary.checked} checked against the feed, `
    + `${summary.skippedAgencies} agencies and ${summary.skippedRows} rows skipped.`);
  for (const row of flagged.slice(0, 10)) console.log(`  ${formatShapeShareLine(row)}`);
  if (outPath) {
    writeFileSync(resolve(outPath), `${JSON.stringify({ summary, flagged, skipped }, null, 2)}\n`);
    console.log(`Report: ${resolve(outPath)}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
