#!/usr/bin/env npx tsx
/**
 * Rebuild History v2 sidecars (history-v2/{slug}/{periodKey}.json) for one agency from
 * archived GTFS zips. Read-only by default and local only:
 *
 *   npx tsx pipeline/backfill-history-v2.ts --slug gcrta --zip-dir <dir of zips> --out-dir tmp/history-v2
 *
 *   --slug <slug>       agency (config read from public/data/index.json)
 *   --zip-dir <dir>     directory of archived zips, named like gtfs/archive/{slug}/{key}.zip
 *                       (the atlas-archive bucket is private, so copy them down first)
 *   --out-dir <dir>     where sidecars are written (default tmp/history-v2). Nothing touches R2.
 *   --overwrite         replace a local sidecar whose content differs (default: report a conflict)
 *   --shapes            also write each period's route shapes to {out-dir}/history-v2-shapes/{slug}/{periodKey}.json
 *                       (docs/data/DATA_HISTORY.md "Route shapes"; off by default, so sidecar output is unchanged)
 *
 * R2 is never read or written by this script; uploading the output is a separate,
 * explicitly approved step. Each zip is processed with the agency's own settings, like
 * reprocess-derived-artifacts does. Agencies with supplemental feeds are refused unless
 *   --bus-only   run on the main feed only; the report is stamped busOnly + supplementalExcluded
 * (supplemental feeds such as rail have no archive, so they never enter a backfill).
 *
 * CIV-1101 Part B: each zip is read with the one service-day model (pickRiderWeek), anchored at the
 * zip's own first full week in force, so a holiday is a day that loses the vote (no holiday list,
 * no re-pick). Published sidecars are never rewritten: a sidecar that differs is a conflict.
 *
 *   --pin-from <dir>    CIV-1430: rebuild published periods at their ORIGINAL reference date. <dir> holds the
 *                       published sidecars at <dir>/history-v2/{slug}/{periodKey}.json; each zip must be named
 *                       {periodKey}.zip. The zip is read at that sidecar's refDate (the old picker with that
 *                       explicit date, as the backfill that wrote it did; a vote-picked sidecar re-reads its
 *                       stored week), and the output keeps the published sidecar's top-level fields
 *                       (refDate, refDateQuality, ...) with freshly built routes, so weekday fields come out
 *                       byte-identical when nothing but the weekend switch changed. A zip with no published
 *                       sidecar, or one the processor reads at a different date, is reported as not pinnable
 *                       and nothing is written for it. The written sidecar is the PUBLISHED file plus only the
 *                       rebuilt weekend p / t / tp (mergeWeekendFields; weekday fields are never taken from the
 *                       rebuild); the full rebuild goes to <out-dir>/full-rebuild/ for comparison only.
 *                       Check the result with history-v2-diff.ts.
 */
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { processAgencyFeeds } from './agencyFeeds.js';
import { peekFeedDates } from './archiveSelection.js';
import { backfillSupplementalPolicy, buildSidecar, buildV2Routes, localDirSink, periodKeyForZip, writeSidecar, type BuildV2Report } from './historyV2.js';
import { readFeedEvidence } from './historyWeekend.js';
import { buildPeriodShapes, shapeTripStats, extractRouteShapes, periodShapesKey } from './historyShapes.js';
import { parseGtfsZip } from './parseGtfs.js';
import { readPickedWeekQuality, readQualityRows } from './historyRefQuality.js';
import { firstFullWeekAnchor } from './serviceDays.js';
import { splitLumpedRoutes, type HistoryRouteSplits } from './historyRouteSplits.js';
import { historyWeekendPeriodsFor } from './historyV2Flag.js';
import { pinnedReadFor, readPinnedBodies, readPinnedSidecars } from './historyV2Pin.js';
import { countAdded, mergeWeekendFields, type MergeSkip } from './historyV2Replace.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const slug = arg('--slug');
  const zipDir = arg('--zip-dir');
  if (!slug || !zipDir) throw new Error('Usage: backfill-history-v2.ts --slug <slug> --zip-dir <dir> [--out-dir <dir>] [--overwrite] [--bus-only]');
  const outDir = resolve(arg('--out-dir') ?? 'tmp/history-v2');
  const index = JSON.parse(readFileSync(resolve('public/data/index.json'), 'utf8')) as { agencies: Array<Record<string, any>> };
  const agency = index.agencies.find(a => a.slug === slug);
  if (!agency) throw new Error(`unknown slug ${slug}`);
  const policy = backfillSupplementalPolicy(slug, agency.supplementalFeedUrls, process.argv.includes('--bus-only'));
  if (policy.busOnly) console.log(`${slug}: ${policy.note} (${policy.supplementalExcluded.join(', ')})`);

  const zips = readdirSync(resolve(zipDir)).filter(f => f.endsWith('.zip')).sort();
  if (zips.length === 0 && !arg('--pin-from')) throw new Error(`no .zip files in ${zipDir}`);
  const sink = localDirSink(outDir, { overwrite: process.argv.includes('--overwrite') });
  const withShapes = process.argv.includes('--shapes');
  const splitKeys = (JSON.parse(readFileSync(resolve('config/history-route-splits.json'), 'utf8')) as HistoryRouteSplits)[slug] ?? [];
  mkdirSync(outDir, { recursive: true });

  const pinFrom = arg('--pin-from');
  const pinned = pinFrom ? readPinnedSidecars(resolve(pinFrom), slug) : null;
  const pinnedBodies = pinFrom ? readPinnedBodies(resolve(pinFrom), slug) : null;
  const fullSink = pinFrom ? localDirSink(resolve(outDir, 'full-rebuild'), { overwrite: process.argv.includes('--overwrite') }) : null;
  const mergeNotes: Array<{ periodKey: string; added: Record<string, number>; skipped: MergeSkip[] }> = [];
  if (pinned) console.log(`${slug}: pinning to ${pinned.size} published sidecar(s) from ${resolve(pinFrom!)}`);

  const rows: Array<{ zip: string; periodKey?: string; anchor?: string; refDate?: string; weekStart?: string; result?: string; report?: BuildV2Report; pin?: { refDate: string; how: string } | null; notPinnable?: string; error?: string }> = [];
  for (const zip of zips) {
    const stem = basename(zip, '.zip');
    try {
      // CIV-1430: a pinned run reads only zips that have a published sidecar, at that sidecar's own date.
      const published = pinned ? pinned.get(stem) : undefined;
      if (pinned && !published) {
        rows.push({ zip, periodKey: stem, notPinnable: 'no published sidecar for this period' });
        console.log(`\n${zip}: NOT PINNABLE (no published sidecar ${stem}); skipped`);
        continue;
      }
      const split = await splitLumpedRoutes(readFileSync(resolve(zipDir, zip)), splitKeys);
      const buf = split.buf;
      if (Object.keys(split.report.moved).length || Object.keys(split.report.unsplit).length) console.log(`${zip}: split lumped routes ${JSON.stringify(split.report)}`);
      const dates = await peekFeedDates(buf);
      const periodKey = published ? stem : periodKeyForZip(stem, dates);
      // The zip's own anchor: its first full week in force (CIV-1101 Part B), never the run date.
      const anchor = published ? null : firstFullWeekAnchor(await readQualityRows(buf));
      const pin = published ? pinnedReadFor(published) : null;
      const overrides = pin ? pin.overrides : anchor ? { serviceAnchor: anchor } : {};
      const processed = await processAgencyFeeds(buf, [], { ...agency, supplementalFeedUrls: [] } as any, overrides, m => process.stdout.write(`  ${m}`));
      if (pin && processed.referenceDate !== pin.refDate) {
        rows.push({ zip, periodKey, refDate: processed.referenceDate, pin: { refDate: pin.refDate, how: pin.how }, notPinnable: `the processor read ${processed.referenceDate}, not the published ${pin.refDate} (${pin.how})` });
        console.log(`\n${zip}: NOT PINNABLE (read ${processed.referenceDate}, published ${pin.refDate}); nothing written`);
        continue;
      }
      const evidence = await readFeedEvidence(buf, { referenceDate: processed.referenceDate });
      const built = buildV2Routes((JSON.parse(processed.geojson) as { features: Array<{ properties?: Record<string, unknown> }> }).features, evidence, { weekendPeriods: historyWeekendPeriodsFor(slug) });
      let sidecar = buildSidecar(slug, periodKey, evidence.refDate, built.routes);
      let result: Awaited<ReturnType<typeof writeSidecar>>;
      let mergeNote = '';
      if (published) {
        // CIV-1430 option 1: the published file, byte for byte, plus ONLY the rebuilt weekend p / t / tp. The full
        // rebuild (today's weekday values too) is kept beside it under full-rebuild/ for comparison, never uploaded.
        sidecar = { ...published, routes: built.routes };
        await fullSink!.put(`history-v2/${slug}/${periodKey}.json`, JSON.stringify(sidecar));
        const merged = mergeWeekendFields(pinnedBodies!.get(periodKey)!, built.routes as Record<string, unknown>);
        result = await sink.put(`history-v2/${slug}/${periodKey}.json`, merged.body);
        mergeNotes.push({ periodKey, added: countAdded(merged.added), skipped: merged.skipped });
        mergeNote = `, merged ${merged.added.length} weekend field(s) into the published file (${merged.skipped.length} day(s) skipped)`;
      } else {
        sidecar.refDateQuality = await readPickedWeekQuality(buf, evidence.refDate, processed.serviceWeekStart);
        result = await writeSidecar(sink, sidecar);
      }
      let shapesNote = '';
      if (withShapes) {
        const gtfs = await parseGtfsZip(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
        const period = buildPeriodShapes(slug, periodKey, evidence.refDate, extractRouteShapes(gtfs as never), { trips: shapeTripStats(gtfs as never) });
        const shapesResult = await sink.put(periodShapesKey(slug, periodKey), JSON.stringify(period));
        if (shapesResult === 'conflict') process.exitCode = 1;
        shapesNote = `, shapes ${shapesResult} (${Object.keys(period.routes).length} routes)`;
      }
      rows.push({ zip, periodKey, anchor: anchor ?? undefined, refDate: evidence.refDate, weekStart: processed.serviceWeekStart ?? undefined, result, report: built.report, ...(pin ? { pin: { refDate: pin.refDate, how: pin.how } } : {}) });
      console.log(`\n${zip} -> ${periodKey} refDate ${evidence.refDate}: ${result}, ${built.report.routes} routes (${built.report.blankWeekday} blank, ${built.report.limited} limited, ${built.report.weekendNone} weekend-none)${shapesNote}, ${pin ? `PINNED to the published ${pin.refDate} (${pin.how})${mergeNote}` : `${sidecar.refDateQuality?.reason} (anchor ${anchor ?? 'none'})`}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      rows.push({ zip, error: message });
      console.error(`\n${zip}: FAILED ${message}`);
    }
  }
  // CIV-1430: published periods with no zip in this run cannot be pinned either.
  const missingZips = pinned ? [...pinned.keys()].filter(pk => !zips.includes(`${pk}.zip`)) : [];
  for (const pk of missingZips) console.log(`${pk}: NOT PINNABLE (published sidecar, no zip ${pk}.zip in ${zipDir})`);
  writeFileSync(resolve(outDir, `${slug}-report.json`), JSON.stringify({ slug, ...(policy.busOnly ? { busOnly: true, supplementalExcluded: policy.supplementalExcluded, note: policy.note } : {}), ...(pinned ? { pinnedFrom: resolve(pinFrom!), publishedWithoutZip: missingZips, weekendMerge: mergeNotes } : {}), rows }, null, 2));
  console.log(`\nReport: ${resolve(outDir, `${slug}-report.json`)}`);
  if (rows.some(r => r.error || r.result === 'conflict')) process.exitCode = 1;
  if (pinned) console.log(`Pinned: ${rows.filter(r => r.pin && !r.notPinnable && !r.error).length} rebuilt, ${rows.filter(r => r.notPinnable).length + missingZips.length} not pinnable, ${rows.filter(r => r.error).length} failed`);
}

main().catch(error => { console.error(error); process.exit(1); });
