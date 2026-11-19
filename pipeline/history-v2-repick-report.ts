#!/usr/bin/env npx tsx
/**
 * CIV-1313 / CIV-1839 DRY RUN (not for merge): count what re-picking older published History periods with the vote
 * picker would change, without writing anything to R2.
 *
 *   npx tsx pipeline/history-v2-repick-report.ts --list-slugs                              (read-only R2 list)
 *   npx tsx pipeline/history-v2-repick-report.ts --slug <slug> --in <dir> --out <dir>      (local files only)
 *   npx tsx pipeline/history-v2-repick-report.ts --summarize <dir of *-repick.json> --md <file>
 *
 * <dir> is the output of history-v2-fetch-pinned.ts (published/history-v2/{slug}/*.json and zips/{periodKey}.zip).
 * For each published period the zip is built twice with today's code: once as published (pinnedReadFor, the same
 * read history-rebuild.yml uses) and once re-picked (anchor = the zip's first full week in force, the approved rule
 * for new timetables, read by the vote picker). Only the picker differs, so every difference is the re-pick's.
 *
 * Read-only by construction: this file imports no R2 writer and no sink, the only writes are report files under
 * --out / --md, and it refuses any argument that asks to write, upload or publish.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { processAgencyFeeds } from './agencyFeeds.js';
import { buildV2Routes } from './historyV2.js';
import { readFeedEvidence } from './historyWeekend.js';
import { readQualityRows } from './historyRefQuality.js';
import { firstFullWeekAnchor } from './serviceDays.js';
import { historyWeekendPeriodsFor } from './historyV2Flag.js';
import { pinnedReadFor, readPinnedSidecars } from './historyV2Pin.js';
import { isEntryPoint } from './historyPublishLib.js';
import type { AgencyProcessOverrides } from './agencyFeeds.js';

const FORBIDDEN_ARG = /write|upload|publish|replace|overwrite|put/i;

/** The explicit dry-run guard: any argument that asks for a write stops the run before anything is read. */
export function assertDryRun(argv: string[]): void {
  const bad = argv.filter(a => a.startsWith('--') && FORBIDDEN_ARG.test(a));
  if (bad.length) throw new Error(`history-v2-repick-report is a dry run and never writes (refused: ${bad.join(' ')})`);
}

export type Season = 'winter' | 'spring' | 'summer' | 'fall';

export function seasonOf(ymd: string): Season {
  const m = Number(ymd.slice(4, 6));
  return m === 12 || m <= 2 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'fall';
}

export interface PeriodRow {
  periodKey: string;
  publishedRefDate: string;
  publishedPickedBy: string;
  repickedRefDate?: string;
  repickedAnchor?: string | null;
  refDateChanged?: boolean;
  seasonChanged?: boolean;
  routes?: number;
  routesChanged?: number;
  routesAdded?: number;
  routesRemoved?: number;
  /** True when the re-pick would change this period's published file (a different week read, or any route differing). */
  periodChanged?: boolean;
  skipped?: string;
  error?: string;
}

/** Compare the as-published build with the re-picked build, route by route (same code, so only the picker differs). */
export function comparePeriod(
  base: Pick<PeriodRow, 'periodKey' | 'publishedRefDate' | 'publishedPickedBy'>,
  pinned: { refDate: string; routes: Record<string, unknown> },
  repicked: { refDate: string; anchor: string | null; routes: Record<string, unknown> },
): PeriodRow {
  const keys = new Set([...Object.keys(pinned.routes), ...Object.keys(repicked.routes)]);
  let changed = 0, added = 0, removed = 0;
  for (const k of keys) {
    const a = pinned.routes[k], b = repicked.routes[k];
    if (a === undefined) added++;
    else if (b === undefined) removed++;
    else if (JSON.stringify(a) !== JSON.stringify(b)) changed++;
  }
  const refDateChanged = pinned.refDate !== repicked.refDate;
  return {
    ...base,
    repickedRefDate: repicked.refDate,
    repickedAnchor: repicked.anchor,
    refDateChanged,
    seasonChanged: seasonOf(pinned.refDate) !== seasonOf(repicked.refDate),
    routes: keys.size,
    routesChanged: changed,
    routesAdded: added,
    routesRemoved: removed,
    periodChanged: refDateChanged || changed + added + removed > 0,
  };
}

export interface Summary {
  agencies: number;
  agenciesWithChange: number;
  periods: number;
  periodsRead: number;
  periodsChanged: number;
  periodsSeasonChanged: number;
  periodsNotRead: number;
  routesCompared: number;
  routesChanged: number;
  routesAddedOrRemoved: number;
  byPublishedPickedBy: Record<string, { periods: number; changed: number }>;
  perAgency: Array<{ slug: string; periods: number; changed: number; seasonChanged: number; notRead: number; routesChanged: number; routes: number }>;
}

export function summarize(reports: Array<{ slug: string; rows: PeriodRow[] }>): Summary {
  const s: Summary = { agencies: reports.length, agenciesWithChange: 0, periods: 0, periodsRead: 0, periodsChanged: 0, periodsSeasonChanged: 0, periodsNotRead: 0, routesCompared: 0, routesChanged: 0, routesAddedOrRemoved: 0, byPublishedPickedBy: {}, perAgency: [] };
  for (const { slug, rows } of reports) {
    const a = { slug, periods: rows.length, changed: 0, seasonChanged: 0, notRead: 0, routesChanged: 0, routes: 0 };
    for (const r of rows) {
      s.periods++;
      const bucket = (s.byPublishedPickedBy[r.publishedPickedBy] ??= { periods: 0, changed: 0 });
      bucket.periods++;
      if (r.skipped || r.error || r.periodChanged === undefined) { s.periodsNotRead++; a.notRead++; continue; }
      s.periodsRead++;
      s.routesCompared += r.routes ?? 0; a.routes += r.routes ?? 0;
      s.routesChanged += r.routesChanged ?? 0; a.routesChanged += r.routesChanged ?? 0;
      s.routesAddedOrRemoved += (r.routesAdded ?? 0) + (r.routesRemoved ?? 0);
      if (r.seasonChanged) { s.periodsSeasonChanged++; a.seasonChanged++; }
      if (r.periodChanged) { s.periodsChanged++; a.changed++; bucket.changed++; }
    }
    if (a.changed > 0) s.agenciesWithChange++;
    s.perAgency.push(a);
  }
  return s;
}

export function summaryMarkdown(s: Summary): string {
  const lines = [
    '# History re-pick dry run (CIV-1313 / CIV-1839)',
    '',
    `- Agencies with published History: ${s.agencies}; would change: ${s.agenciesWithChange}`,
    `- Published periods: ${s.periods}; read: ${s.periodsRead}; could not be read: ${s.periodsNotRead}`,
    `- Periods that would change: ${s.periodsChanged} (of which the season changes: ${s.periodsSeasonChanged})`,
    `- Routes compared: ${s.routesCompared}; routes that would change: ${s.routesChanged}; routes that would appear or disappear: ${s.routesAddedOrRemoved}`,
    '',
    '## By how the published period was picked',
    ...Object.entries(s.byPublishedPickedBy).map(([k, v]) => `- ${k}: ${v.periods} periods, ${v.changed} would change`),
    '',
    '## Per agency',
    '| Agency | Periods | Would change | Season changes | Not read | Routes changed / compared |',
    '|---|---|---|---|---|---|',
    ...s.perAgency.map(a => `| ${a.slug} | ${a.periods} | ${a.changed} | ${a.seasonChanged} | ${a.notRead} | ${a.routesChanged} / ${a.routes} |`),
  ];
  return lines.join('\n') + '\n';
}

async function buildAt(buf: Buffer, agency: Record<string, any>, slug: string, overrides: AgencyProcessOverrides): Promise<{ refDate: string; routes: Record<string, unknown> }> {
  const processed = await processAgencyFeeds(buf, [], { ...agency, supplementalFeedUrls: [] } as any, overrides, () => {});
  const features = (JSON.parse(processed.geojson) as { features: Array<{ properties: Record<string, unknown> }> }).features;
  const nameFromDesc = !!agency.historyNameFromDesc;
  const evidence = await readFeedEvidence(buf, { referenceDate: processed.referenceDate, routeDesc: nameFromDesc });
  const built = buildV2Routes(features, evidence, { weekendPeriods: historyWeekendPeriodsFor(slug), ...(nameFromDesc ? { nameFromDesc } : {}) });
  return { refDate: evidence.refDate, routes: built.routes as Record<string, unknown> };
}

async function reportSlug(slug: string, inDir: string, outDir: string): Promise<void> {
  const index = JSON.parse(readFileSync(resolve('public/data/index.json'), 'utf8')) as { agencies: Array<Record<string, any>> };
  const agency = index.agencies.find(a => a.slug === slug);
  if (!agency) throw new Error(`unknown slug ${slug}`);
  const published = readPinnedSidecars(resolve(inDir, 'published'), slug);
  const rows: PeriodRow[] = [];
  for (const [periodKey, sc] of [...published].sort(([a], [b]) => a.localeCompare(b))) {
    const base = { periodKey, publishedRefDate: sc.refDate, publishedPickedBy: sc.refDateQuality?.pickedBy ?? (sc.refDateQuality?.repicked ? 'holiday-repick' : 'legacy-or-absent') };
    const zipPath = resolve(inDir, 'zips', `${periodKey}.zip`);
    if (!existsSync(zipPath)) { rows.push({ ...base, skipped: 'no zip downloaded for this period' }); continue; }
    if (Array.isArray(agency.supplementalFeedUrls) && agency.supplementalFeedUrls.length) { rows.push({ ...base, skipped: 'agency has supplemental feeds (not covered by this report)' }); continue; }
    try {
      const buf = readFileSync(zipPath);
      const pin = pinnedReadFor(sc);
      const anchor = firstFullWeekAnchor(await readQualityRows(buf));
      if (!anchor) { rows.push({ ...base, skipped: 'no service in the zip, so no anchor' }); continue; }
      const pinned = await buildAt(buf, agency, slug, pin.overrides);
      if (pinned.refDate !== pin.refDate) { rows.push({ ...base, skipped: `as-published read gave ${pinned.refDate}, not the published ${pin.refDate}` }); continue; }
      const repicked = await buildAt(buf, agency, slug, { serviceAnchor: anchor });
      rows.push(comparePeriod(base, pinned, { ...repicked, anchor }));
    } catch (error) {
      rows.push({ ...base, error: error instanceof Error ? error.message : String(error) });
    }
    console.log(`${slug} ${periodKey}: ${JSON.stringify(rows[rows.length - 1])}`);
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, `${slug}-repick.json`), JSON.stringify({ slug, rows }, null, 2));
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  assertDryRun(argv);
  const arg = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  if (argv.includes('--list-slugs')) {
    await import('./loadEnv.js');
    const r2 = await import('./r2.js');
    const slugs = new Set((await r2.r2ListArchive('history-v2/')).flatMap(k => { const m = /^history-v2\/([a-z0-9][a-z0-9-]*)\/[^/]+\.json$/.exec(k); return m ? [m[1]] : []; }));
    console.log(JSON.stringify([...slugs].sort()));
    return;
  }
  const sum = arg('--summarize');
  if (sum) {
    const dir = resolve(sum);
    const files = readdirSync(dir, { recursive: true }).map(String).filter(f => f.endsWith('-repick.json'));
    const reports = files.map(f => JSON.parse(readFileSync(resolve(dir, f), 'utf8')) as { slug: string; rows: PeriodRow[] });
    const s = summarize(reports);
    const md = summaryMarkdown(s);
    const mdPath = arg('--md');
    if (mdPath) writeFileSync(resolve(mdPath), md);
    writeFileSync(resolve(dir, 'summary.json'), JSON.stringify(s, null, 2));
    console.log(md);
    return;
  }
  const slug = arg('--slug'), inDir = arg('--in'), outDir = arg('--out');
  if (!slug || !inDir || !outDir || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error('Usage: history-v2-repick-report.ts --slug <slug> --in <fetch-pinned dir> --out <dir>');
  await reportSlug(slug, inDir, outDir);
}

if (isEntryPoint(import.meta.url)) main().catch(err => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
