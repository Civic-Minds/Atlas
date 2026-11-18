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
 * reprocess-derived-artifacts does. Agencies with supplemental feeds are refused unless one of:
 *   --supplemental-zip-dir <url>=<dir>   (CIV-1484) the archive of a supplemental feed (e.g. rail), once per feed
 *                (a bare <dir> when the agency has one). Each main zip {stem}.zip needs {stem}.zip in every such
 *                dir (the same period's supplemental zip); one missing fails that period. Both feeds go through
 *                processAgencyFeeds like refresh, each route built with its own feed's calendar evidence, and the
 *                sidecar lists supplementalRoutes as refresh writes it. A key in both feeds keeps the main route.
 *   --supplemental-id-prefix <prefix>    (CIV-1484, with --supplemental-zip-dir) prefix a supplemental feed's route, trip
 *                and shape ids for this run only (or <url>=<prefix>), when an archived period reuses a main-feed id
 *                (SEPTA 2017: two shape ids). The agency config, and so its live artifacts, is not changed.
 *   --bus-only   run on the main feed only; the report is stamped busOnly + supplementalExcluded
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
 *                       rebuild); the full rebuild (today's routes) goes to <out-dir>/full-rebuild/, which is
 *                       what history-rebuild.yml uploads since Ryan chose the full redo for CIV-1430 (2026-11-14).
 *                       Check the result with history-v2-diff.ts.
 */
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { processAgencyFeeds } from './agencyFeeds.js';
import { peekFeedDates } from './archiveSelection.js';
import { backfillSupplementalIdPrefixes, backfillSupplementalPolicy, buildSidecar, buildV2Routes, localDirSink, periodKeyForZip, writeSidecar, type BuildV2Report } from './historyV2.js';
import { readFeedEvidence } from './historyWeekend.js';
import { buildPeriodShapes, shapeTripStats, extractRouteShapes, periodShapesKey } from './historyShapes.js';
import { parseGtfsZip } from './parseGtfs.js';
import { readPickedWeekQuality, readQualityRows } from './historyRefQuality.js';
import { firstFullWeekAnchor } from './serviceDays.js';
import { splitLumpedRoutes, type HistoryRouteSplits } from './historyRouteSplits.js';
import { historyV2FromEnv, historyWeekendPeriodsFor } from './historyV2Flag.js';
import { flagsFor, matchedRoutes, planSidecarNoTrip } from './historyV2NoTrip.js';
import { historyNoTripPeriods } from './noTripPeriods.js';
import { historyRouteKey } from './historyRouteKey.js';
import { pinnedReadFor, readPinnedBodies, readPinnedSidecars } from './historyV2Pin.js';
import { countAdded, mergeWeekendFields, type MergeSkip } from './historyV2Replace.js';
import { buildMergedV2Routes, historyV2InputFor } from './historyRefreshSidecar.js';
import type { HistoryV2SidecarRoute } from '../shared/historyV2.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function args(name: string): string[] {
  const out: string[] = [];
  process.argv.forEach((a, i) => { if (a === name && process.argv[i + 1] !== undefined) out.push(process.argv[i + 1]); });
  return out;
}

async function main(): Promise<void> {
  const slug = arg('--slug');
  const zipDir = arg('--zip-dir');
  if (!slug || !zipDir) throw new Error('Usage: backfill-history-v2.ts --slug <slug> --zip-dir <dir> [--out-dir <dir>] [--overwrite] [--bus-only]');
  const outDir = resolve(arg('--out-dir') ?? 'tmp/history-v2');
  const index = JSON.parse(readFileSync(resolve('public/data/index.json'), 'utf8')) as { agencies: Array<Record<string, any>> };
  const agency = index.agencies.find(a => a.slug === slug);
  if (!agency) throw new Error(`unknown slug ${slug}`);
  const policy = backfillSupplementalPolicy(slug, agency.supplementalFeedUrls, process.argv.includes('--bus-only'), args('--supplemental-zip-dir'));
  if (policy.busOnly) console.log(`${slug}: ${policy.note} (${policy.supplementalExcluded.join(', ')})`);
  const supplementalDirs = Object.entries(policy.supplementalDirs);
  const prefixArgs = args('--supplemental-id-prefix');
  if (prefixArgs.length && !supplementalDirs.length) throw new Error('--supplemental-id-prefix needs --supplemental-zip-dir');
  const supplementalIdPrefixes = backfillSupplementalIdPrefixes(slug, agency.supplementalFeedUrls, agency.supplementalIdPrefixes, prefixArgs);
  if (prefixArgs.length) console.log(`${slug}: supplemental id prefixes for this run ${JSON.stringify(supplementalIdPrefixes)}`);
  for (const [url, dir] of supplementalDirs) console.log(`${slug}: supplemental feed ${url} from ${resolve(dir)}`);

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
  // CIV-1862: --notrip-out <dir> (with --pin-from) also plans the add-only no-trips flag for each pinned period.
  const noTripOut = arg('--notrip-out');
  if (noTripOut && !pinFrom) throw new Error('--notrip-out needs --pin-from');
  if (noTripOut && !historyV2FromEnv()) throw new Error('--notrip-out needs ATLAS_HISTORY_V2=1 (the route keys must match the v2 sidecars)');
  const noTripSink = noTripOut ? localDirSink(resolve(noTripOut, 'full-rebuild'), { overwrite: process.argv.includes('--overwrite') }) : null;
  const noTripRows: Array<Record<string, unknown>> = [];
  if (pinned) console.log(`${slug}: pinning to ${pinned.size} published sidecar(s) from ${resolve(pinFrom!)}`);

  const rows: Array<{ zip: string; periodKey?: string; anchor?: string; refDate?: string; weekStart?: string; result?: string; report?: BuildV2Report; supplemental?: Array<{ url: string; refDate: string; routes: number }>; collisions?: Array<{ key: string; droppedFrom: string }>; pin?: { refDate: string; how: string } | null; notPinnable?: string; error?: string }> = [];
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
      // CIV-1484: the same period's supplemental zips (same stem); a missing one fails this period.
      const supplemental = supplementalDirs.map(([url, dir]) => ({ url, buf: readFileSync(resolve(dir, zip)) }));
      const processed = supplemental.length > 0
        ? await processAgencyFeeds(buf, supplemental, { ...agency, supplementalIdPrefixes } as any, overrides, m => process.stdout.write(`  ${m}`))
        : await processAgencyFeeds(buf, [], { ...agency, supplementalFeedUrls: [] } as any, overrides, m => process.stdout.write(`  ${m}`));
      if (pin && processed.referenceDate !== pin.refDate) {
        rows.push({ zip, periodKey, refDate: processed.referenceDate, pin: { refDate: pin.refDate, how: pin.how }, notPinnable: `the processor read ${processed.referenceDate}, not the published ${pin.refDate} (${pin.how})` });
        console.log(`\n${zip}: NOT PINNABLE (read ${processed.referenceDate}, published ${pin.refDate}); nothing written`);
        continue;
      }
      const features = (JSON.parse(processed.geojson) as { features: Array<{ properties: Record<string, unknown> }> }).features;
      let evidence: Awaited<ReturnType<typeof readFeedEvidence>>;
      let built: { routes: Record<string, HistoryV2SidecarRoute>; report: BuildV2Report };
      let supplementalRoutes: Record<string, string[]> | undefined;
      let collisions: Array<{ key: string; droppedFrom: string }> = [];
      if (supplemental.length > 0) {
        const merged = await buildMergedV2Routes(slug, features, historyV2InputFor(processed, buf, supplemental, agency));
        evidence = merged.evidence;
        built = merged.built;
        supplementalRoutes = merged.built.supplementalRoutes;
        collisions = merged.built.collisions;
        if (collisions.length) console.log(`\n${zip}: ${collisions.length} route-key collision(s) between feeds, main route kept: ${collisions.map(c => `${c.key} (${c.droppedFrom} dropped)`).join(', ')}`);
      } else {
        // CIV-1485: an agency with historyNameFromDesc also stores route_desc for routes with no long name.
        const nameFromDesc = !!agency.historyNameFromDesc;
        evidence = await readFeedEvidence(buf, { referenceDate: processed.referenceDate, routeDesc: nameFromDesc });
        built = buildV2Routes(features, evidence, { weekendPeriods: historyWeekendPeriodsFor(slug), ...(nameFromDesc ? { nameFromDesc } : {}) });
      }
      let sidecar = buildSidecar(slug, periodKey, evidence.refDate, built.routes, supplementalRoutes);
      let result: Awaited<ReturnType<typeof writeSidecar>>;
      let mergeNote = '';
      if (published) {
        // CIV-1430: the full rebuild (the published top-level fields, today's routes) goes under full-rebuild/; it is
        // what history-rebuild.yml uploads since Ryan chose the full redo (2026-11-14). The weekend-only merge (option
        // 1: the published file plus ONLY the rebuilt weekend p / t / tp) stays in the main out dir for reference.
        sidecar = { ...published, routes: built.routes };
        await fullSink!.put(`history-v2/${slug}/${periodKey}.json`, JSON.stringify(sidecar));
        if (noTripOut) {
          // CIV-1862: the no-trips flag goes only on routes this rebuild reproduces exactly (per-route match).
          const publishedBody = pinnedBodies!.get(periodKey)!;
          const match = matchedRoutes(publishedBody, JSON.stringify(sidecar));
          const flags = historyNoTripPeriods(features, p => historyRouteKey(p), processed.noTripPeriodsByRoute);
          const plan = planSidecarNoTrip(publishedBody, flagsFor(flags, match.matched));
          const flaggedMismatched = match.mismatched.filter(k => flags[k]?.length);
          if (plan.kind === 'add') await noTripSink!.put(`history-v2/${slug}/${periodKey}.json`, plan.body);
          noTripRows.push({ periodKey, refDate: published.refDate, routes: Object.keys(published.routes ?? {}).length, matched: match.matched.size, mismatched: match.mismatched, ...(match.reason ? { mismatchReason: match.reason } : {}), flaggedButMismatched: flaggedMismatched, outcome: plan.kind === 'skip' ? `skip: ${plan.reason}` : plan.kind, ...(plan.kind === 'add' ? { flaggedRoutes: plan.routes, byPeriod: plan.byPeriod } : plan.kind === 'disagree' ? { disagree: plan.routes.slice(0, 8) } : {}) });
          console.log(`\n${periodKey}: no-trips ${plan.kind}, ${match.matched.size}/${Object.keys(published.routes ?? {}).length} routes match, ${flaggedMismatched.length} flagged route(s) skipped as mismatched`);
        }
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
        const extracted = extractRouteShapes(gtfs as never);
        const trips = shapeTripStats(gtfs as never);
        // CIV-1484: a supplemental feed's lines are added for keys the main feed does not have (the main route wins, as in the sidecar).
        for (const { buf: sbuf } of supplemental) {
          const sg = await parseGtfsZip(sbuf.buffer.slice(sbuf.byteOffset, sbuf.byteOffset + sbuf.byteLength) as ArrayBuffer);
          for (const [key, shape] of extractRouteShapes(sg as never)) if (!extracted.has(key)) extracted.set(key, shape);
          const st = shapeTripStats(sg as never);
          trips.total += st.total; trips.emptyShapeId += st.emptyShapeId; trips.unknownShapeId += st.unknownShapeId;
        }
        const period = buildPeriodShapes(slug, periodKey, evidence.refDate, extracted, { trips });
        const shapesResult = await sink.put(periodShapesKey(slug, periodKey), JSON.stringify(period));
        if (shapesResult === 'conflict') process.exitCode = 1;
        shapesNote = `, shapes ${shapesResult} (${Object.keys(period.routes).length} routes)`;
      }
      rows.push({ zip, periodKey, anchor: anchor ?? undefined, refDate: evidence.refDate, weekStart: processed.serviceWeekStart ?? undefined, result, report: built.report, ...(supplemental.length ? { supplemental: processed.supplementalFeatureCounts.map(f => ({ url: f.url, refDate: f.referenceDate, routes: supplementalRoutes?.[f.url]?.length ?? 0 })), collisions } : {}), ...(pin ? { pin: { refDate: pin.refDate, how: pin.how } } : {}) });
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
  writeFileSync(resolve(outDir, `${slug}-report.json`), JSON.stringify({ slug, ...(policy.busOnly ? { busOnly: true, supplementalExcluded: policy.supplementalExcluded, note: policy.note } : {}), ...(supplementalDirs.length ? { supplementalDirs: Object.fromEntries(supplementalDirs.map(([u, d]) => [u, resolve(d)])), ...(prefixArgs.length ? { supplementalIdPrefixes } : {}) } : {}), ...(pinned ? { pinnedFrom: resolve(pinFrom!), publishedWithoutZip: missingZips, weekendMerge: mergeNotes } : {}), rows }, null, 2));
  console.log(`\nReport: ${resolve(outDir, `${slug}-report.json`)}`);
  if (noTripOut) {
    const sum = (f: (r: Record<string, unknown>) => number) => noTripRows.reduce((n, r) => n + f(r), 0);
    const totals = {
      periodsRead: noTripRows.length,
      periodsPublished: pinned!.size,
      routeRecords: sum(r => r.routes as number),
      routesMatched: sum(r => r.matched as number),
      periodsToAdd: noTripRows.filter(r => r.outcome === 'add').length,
      routesFlagged: sum(r => (r.flaggedRoutes as number) ?? 0),
      flaggedButMismatched: sum(r => (r.flaggedButMismatched as string[]).length),
      disagree: noTripRows.filter(r => r.outcome === 'disagree').length,
    };
    mkdirSync(resolve(noTripOut), { recursive: true });
    writeFileSync(resolve(noTripOut, `${slug}-notrip-report.json`), JSON.stringify({ slug, totals, rows: noTripRows }, null, 2));
    console.log(`No-trips plan: ${JSON.stringify(totals)}`);
  }
  if (rows.some(r => r.error || r.result === 'conflict')) process.exitCode = 1;
  if (pinned) console.log(`Pinned: ${rows.filter(r => r.pin && !r.notPinnable && !r.error).length} rebuilt, ${rows.filter(r => r.notPinnable).length + missingZips.length} not pinnable, ${rows.filter(r => r.error).length} failed`);
}

main().catch(error => { console.error(error); process.exit(1); });
