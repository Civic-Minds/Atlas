#!/usr/bin/env npx tsx
/**
 * Deterministic, read-only route accuracy audit.
 *
 * Samples four routes from each of twenty operators, compares the published
 * artifact with a fresh local GTFS reprocess, and writes a Markdown checklist.
 * No R2 or registry data is written.
 *
 * Usage:
 *   npm run audit:route-accuracy -- --seed=20260926
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseGtfsZip } from '../pipeline/parseGtfs.js';
import { detectReferenceDate } from '../pipeline/transit-calendar.js';
import { computeRawDepartures } from '../pipeline/transit-phase1.js';
import { TIME_PERIODS } from '../shared/config.js';

const SEED = Number(process.argv.find(a => a.startsWith('--seed='))?.slice(7) ?? '20260926');
const OUTPUT = resolve(process.argv.find(a => a.startsWith('--out='))?.slice(6) ?? 'docs/audits/route-accuracy-spot-check-2026-09.md');
const DATA_DIR = process.argv.find(a => a.startsWith('--data-dir='))?.slice(11);
const ARTIFACT_ORIGIN = 'https://data.transitatlas.fyi/atlas';

type JsonFeature = { properties?: Record<string, any> };
type Agency = { slug: string; name: string; region?: string; feedUrl?: string | null; mdbFeedUrl?: string | null };
type RouteGroup = {
  routeId: string;
  shortName: string;
  longName: string;
  routeType: number | null;
  features: Record<string, any>[];
};

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function routeGroups(features: JsonFeature[]): RouteGroup[] {
  const groups = new Map<string, RouteGroup>();
  for (const feature of features) {
    const p = feature.properties;
    if (!p?.routeId || !p.routeShortName) continue;
    const current = groups.get(String(p.routeId)) ?? {
      routeId: String(p.routeId), shortName: String(p.routeShortName),
      longName: String(p.routeLongName ?? ''), routeType: p.routeType == null ? null : Number(p.routeType), features: [],
    };
    current.features.push(p);
    groups.set(current.routeId, current);
  }
  return [...groups.values()];
}

function hasBranchEvidence(group: RouteGroup, all: RouteGroup[]): boolean {
  const variants = new Set(group.features.map(p => p.routeVariant).filter(Boolean));
  const headsigns = new Set(group.features.map(p => p.headsign).filter(Boolean));
  const suffix = group.shortName.match(/^(\d{1,3})([A-Z])$/)?.[1];
  const namedSiblings = suffix != null && all.some(other => other.shortName !== group.shortName && other.shortName.match(/^(\d{1,3})([A-Z])$/)?.[1] === suffix);
  return variants.size >= 2 || headsigns.size >= 2 || namedSiblings;
}

function category(group: RouteGroup, all: RouteGroup[]): 'branch' | 'rail' | 'sparse' | 'clock-face' | 'other' {
  if (hasBranchEvidence(group, all)) return 'branch';
  if (group.routeType === 2 || group.routeType === 0) return 'rail';
  if (group.features.some(p => p.serviceClass !== 'regular' || p.tier === 'span' || p.tier === 'infrequent')) return 'sparse';
  if (group.features.some(p => [5, 6, 10, 12, 15, 20, 30, 60].includes(Number(p.headway)))) return 'clock-face';
  return 'other';
}

function chooseRoutes(groups: RouteGroup[], random: () => number): Array<RouteGroup & { auditCategory: ReturnType<typeof category> }> {
  const byCategory = new Map<string, RouteGroup[]>();
  for (const group of groups) {
    const key = category(group, groups);
    const list = byCategory.get(key) ?? [];
    list.push(group);
    byCategory.set(key, list);
  }
  const chosen: RouteGroup[] = [];
  for (const key of ['branch', 'rail', 'sparse', 'clock-face', 'other']) {
    const candidate = shuffle(byCategory.get(key) ?? [], random)[0];
    if (candidate) chosen.push(candidate);
  }
  for (const group of shuffle(groups, random)) {
    if (chosen.length >= 4) break;
    if (!chosen.some(item => item.routeId === group.routeId)) chosen.push(group);
  }
  return chosen.slice(0, 4).map(group => ({ ...group, auditCategory: category(group, groups) }));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function independentPeriodMedian(times: number[], startHour: number, endHour: number): number | null {
  const inWindow = times.filter(time => time >= startHour * 60 && time < endHour * 60).sort((a, b) => a - b);
  if (inWindow.length < 3) return null;
  return median(inWindow.slice(1).map((time, index) => time - inWindow[index]));
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url, { headers: { 'User-Agent': 'atlas-route-accuracy-audit/1.0' }, signal: AbortSignal.timeout(90_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function chooseAgencies(agencies: Agency[], random: () => number): Agency[] {
  const groups = new Map<string, Agency[]>();
  for (const agency of agencies) {
    const key = agency.region?.trim() || 'unknown';
    const list = groups.get(key) ?? [];
    list.push(agency);
    groups.set(key, list);
  }
  const regions = shuffle([...groups.keys()], random);
  const pools = new Map([...groups.entries()].map(([region, list]) => [region, shuffle(list, random)]));
  const selected: Agency[] = [];
  while (regions.length > 0) {
    for (const region of [...regions]) {
      const list = pools.get(region)!;
      if (list.length === 0) { regions.splice(regions.indexOf(region), 1); continue; }
      selected.push(list.shift()!);
    }
  }
  return selected;
}

async function auditAgency(agency: Agency, selected: ReturnType<typeof chooseRoutes>) {
  if (!DATA_DIR) throw new Error('Pass --data-dir from audit:reprocess; the 80-route audit must use fresh local outputs');
  const freshArtifact = JSON.parse(readFileSync(resolve(DATA_DIR, `${agency.slug}.json`), 'utf8')) as { features: JsonFeature[] };
  const publishedArtifact = await fetchJson<{ features: JsonFeature[] }>(`${ARTIFACT_ORIGIN}/${agency.slug}.json`);
  const buffer = await fetchBuffer(agency.feedUrl || agency.mdbFeedUrl || '');
  const gtfs = await parseGtfsZip(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer);
  const refDate = detectReferenceDate(gtfs.calendar ?? [], gtfs.calendarDates ?? [], gtfs.trips ?? []);
  const raw = computeRawDepartures(gtfs, refDate).filter(item => item.day === 'Wednesday');
  const freshFeatures = freshArtifact.features;
  const routeMap = new Map((gtfs.routes ?? []).map(route => [route.route_id, route]));

  return selected.map(group => {
    const published = publishedArtifact.features.filter(feature => String(feature.properties?.routeId) === group.routeId).map(feature => feature.properties!);
    const reprocessed = freshFeatures.filter(feature => String(feature.properties?.routeId) === group.routeId).map(feature => feature.properties!);
    const rawRoute = raw.filter(item => item.route === group.routeId);
    const variantCodes = [...new Set(rawRoute.map(item => item.routeVariant).filter(Boolean))].sort();
    const direction = group.features[0]?.directionId == null ? null : String(group.features[0].directionId);
    const directionRaw = rawRoute.filter(item => item.dir === direction);
    const periodMedians = Object.fromEntries(TIME_PERIODS.map(period => [
      period.key,
      independentPeriodMedian(directionRaw.flatMap(item => item.departureTimes), period.startHour, period.endHour),
    ]));
    const branchCodesPreserved = variantCodes.length < 2 || new Set(reprocessed.map(p => p.routeVariant).filter(Boolean)).size >= 2;
    const sparseRows = reprocessed.filter(p => p.tier === 'infrequent' && p.maxGapByPeriod?.amPeak != null && p.headwayByPeriod?.amPeak != null && p.maxGapByPeriod.amPeak > p.headwayByPeriod.amPeak * 1.5);
    const sparseGuardPasses = sparseRows.length === 0 || sparseRows.every(p => p.headwayByPeriodSustained?.amPeak === false || p.serviceClass !== 'regular');
    const status = branchCodesPreserved && sparseGuardPasses ? 'PASS' : 'FAIL';
    return {
      agency: agency.name, slug: agency.slug, routeId: group.routeId, route: group.shortName,
      longName: group.longName, category: group.auditCategory, routeType: routeMap.get(group.routeId)?.route_type ?? null,
      publishedFeatures: published.length, reprocessedFeatures: reprocessed.length, variantCodes,
      reprocessedVariants: [...new Set(reprocessed.map(p => p.routeVariant).filter(Boolean))].sort(),
      direction, periodMedians, atlasAmPeak: published[0]?.headwayByPeriod?.amPeak ?? null,
      freshAmPeak: reprocessed[0]?.headwayByPeriod?.amPeak ?? null,
      branchCodesPreserved, sparseGuardPasses, status,
      pdfReview: status === 'PASS' ? 'only if GTFS interpretation is unclear' : 'required',
    };
  });
}

async function main() {
  if (!Number.isInteger(SEED)) throw new Error(`Invalid seed: ${SEED}`);
  if (!DATA_DIR) throw new Error('Usage: npm run audit:route-accuracy -- --data-dir=tmp/route-accuracy-reprocess-YYYY-MM-DD --seed=20260926');
  const index = JSON.parse(readFileSync(resolve('public/data/index.json'), 'utf8')) as { agencies: Agency[] };
  const random = seededRandom(SEED);
  const eligible = index.agencies.filter(agency => (agency.feedUrl || agency.mdbFeedUrl) && existsSync(resolve(DATA_DIR, `${agency.slug}.json`)));
  const agencies = chooseAgencies(eligible, random);
  if (agencies.length < 20) throw new Error(`Expected at least 20 successfully reprocessed agencies, found ${agencies.length}`);
  const allRows: any[] = [];
  const failures: string[] = [];
  for (const agency of agencies) {
    if (allRows.length >= 80) break;
    process.stdout.write(`Auditing ${agency.name}...\n`);
    try {
      const artifact = JSON.parse(readFileSync(resolve(DATA_DIR, `${agency.slug}.json`), 'utf8')) as { features: JsonFeature[] };
      const selected = chooseRoutes(routeGroups(artifact.features), random);
      if (selected.length < 4) throw new Error(`only ${selected.length} route candidates`);
      const rows = await auditAgency(agency, selected);
      allRows.push(...rows);
    } catch (error) {
      failures.push(`${agency.slug}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (allRows.length !== 80) throw new Error(`Expected 80 audited routes, got ${allRows.length}; failures: ${failures.join('; ')}`);

  const lines = [
    '# Atlas route accuracy spot check', '',
    `- Seed: \`${SEED}\``,
    `- Generated: ${new Date().toISOString()}`,
    '- Sample: 20 operators × 4 routes',
    '- GTFS: current agency feed, Wednesday service, independent period medians',
    '- PDF review: required only for failures or unclear GTFS interpretation', '',
    '| Result | Operator | Route | Category | GTFS branches | Atlas branches after reprocess | AM GTFS | Atlas published → fresh | PDF review |',
    '| :---: | :--- | :--- | :--- | :--- | :--- | ---: | ---: | :--- |',
  ];
  for (const row of allRows) {
    lines.push(`| ${row.status} | ${row.agency} | ${row.route} — ${row.longName} | ${row.category} | ${row.variantCodes.join(', ') || 'none'} | ${row.reprocessedVariants.join(', ') || 'none'} | ${row.periodMedians.amPeak ?? '—'} | ${row.atlasAmPeak ?? '—'} → ${row.freshAmPeak ?? '—'} | ${row.pdfReview} |`);
  }
  lines.push('', '## Summary', '', `- Pass: ${allRows.filter(row => row.status === 'PASS').length}`, `- Fail: ${allRows.filter(row => row.status === 'FAIL').length}`, `- PDF follow-ups: ${allRows.filter(row => row.pdfReview === 'required').length}`, `- Operator/feed failures: ${failures.length}`);
  if (failures.length) lines.push('', '## Operator failures', '', ...failures.map(failure => `- ${failure}`));
  mkdirSync(resolve(OUTPUT, '..'), { recursive: true });
  writeFileSync(OUTPUT, `${lines.join('\n')}\n`);
  console.log(`\nWrote ${OUTPUT}`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
