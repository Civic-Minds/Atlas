#!/usr/bin/env npx tsx
/**
 * CIV-1850: plan the CIV-471 no-trips flag for every published History v2 sidecar of one agency. READ-ONLY.
 *
 *   ATLAS_HISTORY_V2=1 npx tsx pipeline/history-v2-notrip-backfill.ts --slug ttc --out <dir>
 *
 * For each sidecar: pick its feed, read it pinned at the sidecar's own date (pinnedReadFor; kept only when the
 * processor read exactly refDate), flag routes with historyNoTripPeriods, and plan the add-only body
 * (historyV2NoTrip.ts). Which feed:
 * - hash: the archived zip named by the period key whose feed hash equals the sidecar's feedSha256;
 * - no hash: exactly one archived zip named by the period key, refDate inside its service dates, and the read's
 *   route keys equal to the published ones (supplemental-feed routes aside).
 * Writes <out>/full-rebuild/history-v2/{slug}/{periodKey}.json for each planned sidecar (the upload step,
 * history-v2-upload.ts --replace-approved CIV-1850, is the only writer), plus <out>/{slug}-report.json and
 * <out>/{slug}-summary.md. Never writes R2.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { HistoryV2Sidecar } from '../shared/historyV2.js';
import { isEntryPoint, parseFlags } from './historyPublishLib.js';
import { historyV2FromEnv } from './historyV2Flag.js';
import { planSidecarNoTrip, routeKeyMismatch } from './historyV2NoTrip.js';

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

type Klass = 'hash' | 'no-hash';
interface Row { periodKey: string; refDate: string; klass: Klass; outcome: string; zip?: string; detail?: unknown }

async function main(): Promise<number> {
  await import('./loadEnv.js');
  const { values } = parseFlags(process.argv.slice(2), ['--slug', '--out', '--period', '--max-disagree-pct'], []);
  const slug = values['--slug'];
  const out = values['--out'];
  if (!slug || !out || !SLUG_RE.test(slug)) throw new Error('Usage: history-v2-notrip-backfill.ts --slug <slug> --out <dir> [--period <periodKey>]');
  if (!historyV2FromEnv()) throw new Error('ATLAS_HISTORY_V2=1 is required (the route keys must match the v2 sidecars)');

  const index = JSON.parse(readFileSync(resolve('public/data/index.json'), 'utf8')) as { agencies: Array<Record<string, any>> };
  const agency = index.agencies.find(a => a.slug === slug);
  if (!agency) throw new Error(`unknown slug ${slug}`);
  const splitKeys = (JSON.parse(readFileSync(resolve('config/history-route-splits.json'), 'utf8')) as Record<string, string[]>)[slug] ?? [];

  const r2 = await import('./r2.js');
  const { processAgencyFeeds } = await import('./agencyFeeds.js');
  const { splitLumpedRoutes } = await import('./historyRouteSplits.js');
  const { pinnedReadFor } = await import('./historyV2Pin.js');
  const { historyNoTripPeriods } = await import('./noTripPeriods.js');
  const { historyRouteKey } = await import('./historyRouteKey.js');
  const { peekFeedDates } = await import('./archiveSelection.js');
  const { feedSetSha256 } = await import('./feedPeek.js');

  const sidecarKeys = (await r2.r2ListArchive(`history-v2/${slug}/`)).filter(k => k.endsWith('.json')).sort();
  const archiveZips = (await r2.r2ListArchive(`gtfs/archive/${slug}/`)).filter(k => k.endsWith('.zip')).sort();
  const stem = (k: string) => k.slice(k.lastIndexOf('/') + 1, -'.zip'.length);
  const outDir = resolve(out, 'full-rebuild', 'history-v2', slug);
  mkdirSync(outDir, { recursive: true });
  console.log(`${slug}: ${sidecarKeys.length} sidecar(s), ${archiveZips.length} archived zip(s)`);

  const rows: Row[] = [];
  for (const key of sidecarKeys) {
    const periodKey = key.slice(key.lastIndexOf('/') + 1, -'.json'.length);
    if (values['--period'] && periodKey !== values['--period']) continue;
    const body = await r2.r2GetArchive(key);
    if (body == null) { rows.push({ periodKey, refDate: '', klass: 'no-hash', outcome: 'skip: listed but missing' }); continue; }
    const sc = JSON.parse(body) as HistoryV2Sidecar & Record<string, unknown>;
    const klass: Klass = sc.feedSha256 ? 'hash' : 'no-hash';
    const row: Row = { periodKey, refDate: sc.refDate, klass, outcome: '' };
    rows.push(row);
    const named = archiveZips.filter(k => stem(k) === periodKey || stem(k).startsWith(`${periodKey}-`));
    let buf: Buffer | null = null;
    if (klass === 'hash') {
      for (const k of named) {
        const b = await r2.r2GetArchiveBuffer(k);
        if (b && feedSetSha256([b]) === sc.feedSha256) { buf = b; row.zip = k; break; }
      }
      if (!buf) { row.outcome = named.length ? 'skip: no archived zip has the feed hash' : 'skip: no archived zip for the period'; continue; }
    } else {
      if (named.length !== 1) { row.outcome = named.length ? `skip: ${named.length} archived zips for the period` : 'skip: no archived zip for the period'; continue; }
      buf = await r2.r2GetArchiveBuffer(named[0]);
      row.zip = named[0];
      if (!buf) { row.outcome = 'skip: download returned nothing'; continue; }
      const dates = await peekFeedDates(buf);
      if (!dates.feedStart || !dates.feedExpiry || sc.refDate < dates.feedStart || sc.refDate > dates.feedExpiry) {
        row.outcome = 'skip: refDate outside the zip service dates';
        row.detail = { feedStart: dates.feedStart, feedExpiry: dates.feedExpiry };
        continue;
      }
    }
    const pin = pinnedReadFor(sc);
    let processed: Awaited<ReturnType<typeof processAgencyFeeds>>;
    try {
      const split = await splitLumpedRoutes(buf, splitKeys);
      processed = await processAgencyFeeds(split.buf, [], { ...agency, supplementalFeedUrls: [] } as any, pin.overrides, () => {});
    } catch (error) {
      row.outcome = `skip: processing failed`;
      row.detail = error instanceof Error ? error.message : String(error);
      continue;
    }
    if (processed.referenceDate !== pin.refDate) { row.outcome = 'skip: not pinnable'; row.detail = { read: processed.referenceDate, how: pin.how }; continue; }
    const features = (JSON.parse(processed.geojson) as { features: Array<{ properties: Record<string, unknown> }> }).features;
    if (klass === 'no-hash') {
      const readKeys = new Set(features.map(f => historyRouteKey(f.properties)).filter((k): k is string => !!k));
      const mismatch = routeKeyMismatch(sc, readKeys);
      if (mismatch.length) { row.outcome = 'skip: route keys differ'; row.detail = mismatch; continue; }
    }
    const flags = historyNoTripPeriods(features, p => historyRouteKey(p), processed.noTripPeriodsByRoute);
    const plan = planSidecarNoTrip(body, flags);
    if (plan.kind === 'skip') { row.outcome = `skip: ${plan.reason}`; continue; }
    if (plan.kind === 'disagree') { row.outcome = 'disagree'; row.detail = plan.routes.slice(0, 8); continue; }
    writeFileSync(resolve(outDir, `${periodKey}.json`), plan.body);
    row.outcome = 'add';
    row.detail = { routes: plan.routes, byPeriod: plan.byPeriod };
    console.log(`${periodKey}: ${klass}, refDate ${sc.refDate}, ${plan.routes} route(s) flagged ${JSON.stringify(plan.byPeriod)}`);
  }

  const count = (f: (r: Row) => boolean) => rows.filter(f).length;
  const outcomes = rows.reduce<Record<string, number>>((acc, r) => { const k = `${r.klass} | ${r.outcome}`; acc[k] = (acc[k] ?? 0) + 1; return acc; }, {});
  const read = count(r => r.outcome === 'add' || r.outcome === 'disagree' || r.outcome === 'skip: no route flagged');
  const disagree = count(r => r.outcome === 'disagree');
  const totals = {
    sidecars: rows.length,
    toAdd: count(r => r.outcome === 'add'),
    routesFlagged: rows.reduce((n, r) => n + (r.outcome === 'add' ? (r.detail as { routes: number }).routes : 0), 0),
    read,
    disagree,
    disagreeShareOfRead: read ? Math.round((disagree / read) * 1000) / 10 : 0,
  };
  mkdirSync(resolve(out), { recursive: true });
  writeFileSync(resolve(out, `${slug}-report.json`), JSON.stringify({ slug, totals, outcomes, rows }, null, 2));
  writeFileSync(resolve(out, `${slug}-summary.md`), [
    `### ${slug} (dry run)`,
    `- Sidecars: ${totals.sidecars}; to add the flag: ${totals.toAdd} (${totals.routesFlagged} route records)`,
    `- Read and compared: ${totals.read}; disagree (skipped): ${totals.disagree} (${totals.disagreeShareOfRead}%)${totals.disagreeShareOfRead > 20 ? ' **over 20%: stop before any write**' : ''}`,
    ...Object.entries(outcomes).sort().map(([k, v]) => `- ${k}: ${v}`),
    '',
  ].join('\n'));
  console.log(`${slug}: ${JSON.stringify(totals)}`);
  // The write run stops an agency whose read disagrees with too many published periods (manager, 2026-11-18: ~20%).
  const maxPct = values['--max-disagree-pct'];
  if (maxPct !== undefined && totals.disagreeShareOfRead > Number(maxPct)) {
    console.log(`STOP: ${slug} disagrees on ${totals.disagreeShareOfRead}% of the periods read (limit ${maxPct}%); nothing will be written`);
    return 1;
  }
  return 0;
}

if (isEntryPoint(import.meta.url)) main().then(code => { process.exitCode = code; }).catch(err => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
