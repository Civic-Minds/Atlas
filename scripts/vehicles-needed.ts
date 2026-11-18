#!/usr/bin/env npx tsx
/**
 * CIV-1685: buses needed to run each route at a headway, from the agency's own schedule.
 * Local only: reads a GTFS zip, writes nothing (no R2, no registry, no files).
 *
 * Usage:
 *   npx tsx scripts/vehicles-needed.ts <feed.zip> [--slug <slug>] [--headway <min>] [--period <key>]
 *     [--route <short name>] [--anchor YYYYMMDD] [--target-applies trunk|branch] [--branch-split current|even]
 *     [--short-turn-headway <min>] [--recovery schedule|<n>%|<n>] [--json <out.json>]
 *
 * --slug     reads config/agencies/<slug>.json so preprocess and excludes match the map.
 * --anchor   the rider-week anchor (default: today), for an archived feed whose service has ended.
 * --headway  the target minutes between buses. Where branches share a middle section it applies to
 *            that shared middle by default (--target-applies trunk), split among branches by each
 *            branch's current share of trips (--branch-split current; or even). --target-applies
 *            branch runs every branch at the target instead.
 * --short-turn-headway  minutes between short-turn buses (default: their current headway).
 * --recovery  layover counted in the cycle: the schedule's own (default), a percent of running time
 *            (10%), or minutes per leg (8). It replaces the schedule's layover.
 *
 * --json     also writes the Studio page's rows (every period, by interlined route group; see
 *            pipeline/vehicleGroups.ts) to a local file, e.g. tmp/studio/kingston-vehicles.json, which
 *            only the Vite dev server serves (CIV-1693). Uses the schedule's layover; nothing is uploaded.
 *
 * Output: one row per service pattern (a round trip: out-and-back, loop, or one-way), then each
 * route's totals, shared middles (trunks), interlined groups, and notes. See pipeline/vehiclePatterns.ts.
 *
 * The current headway is the map's own route value (worstDirectionHeadwayByPeriod on the Weekday
 * features), read from processGtfsBuffer, so it matches what the map shows. The day counted is the
 * route's representative weekday (pickRepresentativeWeekday) in the week the map reads.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { processGtfsBuffer, type ProcessOptions } from '../pipeline/process-core.js';
import { agencyProcessOptions, type AgencyFeedConfig } from '../pipeline/agencyFeeds.js';
import { pickRepresentativeWeekday } from '../pipeline/representativeWeekday.js';
import { tripRunsForDay } from '../pipeline/vehiclesNeeded.js';
import { PRODUCT_FOCUS } from '../shared/rules/focus.js';
import { cycleMin, needVehicles, unevenLegs, parseRecovery, periodPatterns, recoveryMin, targetVehicles, type Places, type TargetOptions } from '../pipeline/vehiclePatterns.js';
import { vehicleGroupRows } from '../pipeline/vehicleGroups.js';
import type { StudioVehiclesFile } from '../shared/studioVehicles.js';
import { PERIOD_KEYS, PERIOD_LABELS, PERIOD_MINUTES, type HeadwayByPeriod, type PeriodKey } from '../shared/config.js';
import { WEEKDAYS, type DayName, type GtfsData } from '../types/gtfs.js';

const args = process.argv.slice(2);
function option(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}
const optionNames = new Set(['--slug', '--headway', '--period', '--route', '--anchor', '--target-applies', '--branch-split', '--short-turn-headway', '--recovery', '--json']);
const positional = args.filter((a, i) => !a.startsWith('--') && !optionNames.has(args[i - 1]));
const zipPath = positional[0];
if (!zipPath || !existsSync(zipPath)) {
  console.error('Usage: npx tsx scripts/vehicles-needed.ts <feed.zip> [--slug <slug>] [--headway <min>] [--period <key>] [--route <short name>] [--anchor YYYYMMDD]');
  process.exit(1);
}
const slug = option('--slug');
const targetHeadway = option('--headway') != null ? Number(option('--headway')) : null;
if (targetHeadway != null && !(targetHeadway > 0)) throw new Error('--headway must be a positive number of minutes');
const periodArg = option('--period');
if (periodArg && !PERIOD_KEYS.includes(periodArg as PeriodKey)) throw new Error(`--period must be one of ${PERIOD_KEYS.join(', ')}`);
const periods: PeriodKey[] = periodArg ? [periodArg as PeriodKey] : PERIOD_KEYS;
const routeFilter = option('--route');
const anchor = option('--anchor');
const appliesTo = (option('--target-applies') ?? 'trunk') as TargetOptions['appliesTo'];
if (appliesTo !== 'trunk' && appliesTo !== 'branch') throw new Error('--target-applies must be trunk or branch');
const branchSplit = (option('--branch-split') ?? 'current') as TargetOptions['branchSplit'];
if (branchSplit !== 'current' && branchSplit !== 'even') throw new Error('--branch-split must be current or even');
const shortTurnHeadway = option('--short-turn-headway') != null ? Number(option('--short-turn-headway')) : null;
if (shortTurnHeadway != null && !(shortTurnHeadway > 0)) throw new Error('--short-turn-headway must be a positive number of minutes');
const recovery = parseRecovery(option('--recovery'));
const jsonOut = option('--json');

// CIV-1866: the figures go to focus agencies first (shared/rules/focus.ts); say so, don't stop, for any other.
if (slug && !(PRODUCT_FOCUS.vehiclesNeeded as readonly string[]).includes(slug)) {
  console.error(`Note: ${slug} is not on the vehicles-needed focus list (shared/rules/focus.ts); build it only if an agency or consultant asked.`);
}

const config: AgencyFeedConfig | null = slug
  ? JSON.parse(readFileSync(resolve('config/agencies', `${slug}.json`), 'utf8')) as AgencyFeedConfig
  : null;
const options: ProcessOptions = {
  ...(config ? agencyProcessOptions(config) : { riderWeek: true, ...(slug ? { slug } : {}) }),
  ...(anchor ? { serviceAnchor: anchor } : {}),
};

type ServiceDays = { gtfs: GtfsData; referenceDate: string; activeServiceIdsByCalendarDay: ReadonlyMap<DayName, ReadonlySet<string>> };
const seen: { value: ServiceDays | null } = { value: null };
const result = await processGtfsBuffer(readFileSync(zipPath), undefined, { ...options, onServiceDays: input => { seen.value = input; } });
if (!seen.value) throw new Error('processGtfsBuffer did not report its service days');
const { gtfs, referenceDate, activeServiceIdsByCalendarDay } = seen.value;

// The map's route value per period: worst direction, Weekday features, by route_id.
type Props = { routeId: string; routeShortName?: string; day?: string; worstDirectionHeadwayByPeriod?: HeadwayByPeriod; headsign?: string | null; routeBranch?: string | null };
const features = (JSON.parse(result.geojson) as { features: Array<{ properties: Props }> }).features;
const mapHeadway = new Map<string, { shortName: string; byPeriod: HeadwayByPeriod; patterns: Set<string> }>();
for (const { properties: p } of features) {
  if (p.day !== 'Weekday') continue;
  const entry = mapHeadway.get(p.routeId) ?? { shortName: p.routeShortName ?? p.routeId, byPeriod: {}, patterns: new Set<string>() };
  entry.patterns.add(`${p.routeBranch ?? ''}|${p.headsign ?? ''}`);
  for (const pk of PERIOD_KEYS) {
    const v = p.worstDirectionHeadwayByPeriod?.[pk];
    // Every Weekday feature of a route carries the same route value; keep the largest if a branch differs.
    if (v != null) entry.byPeriod[pk] = Math.max(entry.byPeriod[pk] ?? 0, v);
  }
  mapHeadway.set(p.routeId, entry);
}

// Runs per weekday (days with identical service share one pass), then each route's representative weekday.
const runsByDay = new Map<DayName, ReturnType<typeof tripRunsForDay>>();
const runsByServiceKey = new Map<string, ReturnType<typeof tripRunsForDay>>();
for (const day of WEEKDAYS) {
  const ids = activeServiceIdsByCalendarDay.get(day) ?? new Set<string>();
  const key = [...ids].sort().join('\u0000');
  if (!runsByServiceKey.has(key)) runsByServiceKey.set(key, tripRunsForDay(gtfs, ids, { withStops: true }));
  runsByDay.set(day, runsByServiceKey.get(key)!);
}
const countsByRoute = new Map<string, number[]>();
WEEKDAYS.forEach((day, i) => {
  for (const run of runsByDay.get(day)!) {
    const counts = countsByRoute.get(run.routeId) ?? [0, 0, 0, 0, 0];
    counts[i]++;
    countsByRoute.set(run.routeId, counts);
  }
});

const places: Places = {
  coords: new Map(gtfs.stops.map(s => [s.stop_id, { lat: Number(s.stop_lat), lon: Number(s.stop_lon) }])),
  parentOf: new Map(gtfs.stops.filter(s => s.parent_station).map(s => [s.stop_id, s.parent_station!])),
};
const stopName = new Map(gtfs.stops.map(s => [s.stop_id, s.stop_name]));
const shortNameOf = new Map((gtfs.routes ?? []).map(r => [r.route_id, r.route_short_name || r.route_long_name || r.route_id]));
const nameOf = (routeId: string) => shortNameOf.get(routeId) ?? routeId;
const fmt = (v: number | null | undefined) => (v == null ? '-' : String(Math.round(v)));

type Analysis = ReturnType<typeof periodPatterns>;
const cache = new Map<string, Analysis>();
const analysis = (day: DayName, period: PeriodKey) => {
  const key = `${day}|${period}`;
  if (!cache.has(key)) cache.set(key, periodPatterns(runsByDay.get(day)!, PERIOD_MINUTES[period], places));
  return cache.get(key)!;
};

const routeIds = [...countsByRoute.keys()].sort((a, b) => nameOf(a).localeCompare(nameOf(b), undefined, { numeric: true }));
const recoveryLabel = recovery.kind === 'schedule' ? "schedule's layover" : recovery.kind === 'percent' ? `${recovery.value}% of running time` : `${recovery.value} min per leg`;

console.log(`Feed ${zipPath}${slug ? ` (${slug})` : ''}, reference date ${referenceDate}${result.serviceWeekStart ? `, week of ${result.serviceWeekStart}` : ''}`);
console.log(`cycle = running + recovery (${recoveryLabel}); "hw" = the pattern's own scheduled minutes between departures in the period`);
if (targetHeadway != null) {
  console.log(`target every ${targetHeadway} min applies to ${appliesTo === 'trunk' ? `the shared middle where branches meet (split by ${branchSplit === 'current' ? "each branch's current share of trips" : 'even shares'})` : 'each branch'}; short turns ${shortTurnHeadway != null ? `every ${shortTurnHeadway} min` : 'kept at current headway'}`);
}

for (const period of periods) {
  const patternRows: string[][] = [];
  const routeRows: string[][] = [];
  const extra: string[] = [];
  const seenGroups = new Set<string>();
  for (const routeId of routeIds) {
    const shortName = nameOf(routeId);
    if (routeFilter && shortName !== routeFilter) continue;
    const index = pickRepresentativeWeekday(countsByRoute.get(routeId)!, true);
    if (index == null) continue;
    const day = WEEKDAYS[index];
    const a = analysis(day, period);
    const patterns = a.patterns.filter(p => p.routeId === routeId);
    if (patterns.length === 0) continue;
    const targets = targetHeadway != null
      ? targetVehicles(patterns, a.trunks, { headwayMin: targetHeadway, appliesTo, branchSplit, shortTurnHeadwayMin: shortTurnHeadway, recovery })
      : [];
    const labelOf = new Map(patterns.map((p, i) => [p.id, `${shortName}${String.fromCharCode(97 + Math.min(i, 25))}`]));
    let sched = 0;
    let implied = 0;
    let targetSum = 0;
    for (const p of patterns) {
      const cycle = cycleMin(p, recovery);
      const need = needVehicles(p, recovery);
      const at = need > 0 ? Math.ceil(need - 1e-9) : null;
      const leg = p.legs[0];
      const ends = `${stopName.get(leg.firstStop) ?? leg.firstStop} - ${stopName.get(leg.lastStop) ?? leg.lastStop}`;
      const role = p.role + (p.relatedTo.length ? ` (${p.role === 'short turn' ? 'of' : 'with'} ${p.relatedTo.map(id => labelOf.get(id)).join(',')})` : '');
      const t = targets.find(x => x.id === p.id);
      sched += p.scheduledVehicles;
      if (p.role !== 'partial') {
        implied += need;
        targetSum += t?.vehicles ?? 0;
      }
      patternRows.push([
        labelOf.get(p.id)!,
        day.slice(0, 3),
        ends.length > 48 ? `${ends.slice(0, 47)}…` : ends,
        role,
        p.pairedBy,
        String(Math.round(p.departures)),
        fmt(p.headwayMin),
        fmt(p.runningMin),
        p.layoverMin == null ? 'not in feed' : fmt(p.layoverMin),
        fmt(recoveryMin(p, recovery)),
        fmt(cycle),
        `${p.scheduledVehicles}${p.scheduledBasis === 'trips' ? ' (trips)' : ''}`,
        p.role === 'partial' ? '-' : String(at ?? '-'),
        ...(targetHeadway != null ? [t?.vehicles != null ? `${t.vehicles} @${fmt(t.headwayMin)}` : '-'] : []),
        [...p.notes, ...(unevenLegs(p) ? [`legs run at different frequencies (${p.legs.map(l => Math.round(l.ratePerMin * 60 * 10) / 10).join(' vs ')} per hour)`] : []), ...(p.interlinedWith.length ? [`interlined with ${p.interlinedWith.map(nameOf).join('+')}`] : [])].join('; '),
      ]);
    }
    const map = mapHeadway.get(routeId);
    routeRows.push([shortName, day.slice(0, 3), fmt(map?.byPeriod[period]), String(patterns.length), String(sched), String(Math.ceil(implied - 1e-9)), ...(targetHeadway != null ? [String(targetSum)] : [])]);
    for (const trunk of a.trunks.filter(t => t.routeId === routeId)) {
      extra.push(`shared middle ${shortName}: ${trunk.branches.map(id => labelOf.get(id)).join(', ')} share ${trunk.stopIds.length} stops, ${stopName.get(trunk.stopIds[0]) ?? trunk.stopIds[0]} to ${stopName.get(trunk.stopIds.at(-1)!) ?? trunk.stopIds.at(-1)}`);
    }
    for (const g of a.interlines.filter(g => g.routeIds.includes(routeId))) {
      const key = `${day}|${g.routeIds.join(',')}`;
      if (seenGroups.has(key)) continue;
      seenGroups.add(key);
      extra.push(`interlined ${g.routeIds.map(nameOf).join('+')} (${day.slice(0, 3)}): ${g.switches} route switches in period, combined cycle ${fmt(g.combinedCycleMin)} min (${g.cycleSamples} samples), ${g.scheduledVehicles} buses scheduled on the group, ${g.impliedVehicles} implied at each pattern's own headway`);
    }
  }
  const print = (header: string[], rows: string[][]) => {
    const widths = header.map((h, i) => Math.max(h.length, ...rows.map(r => r[i].length)));
    const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join(' | ').trimEnd();
    console.log(line(header));
    console.log(widths.map(w => '-'.repeat(w)).join('-|-'));
    for (const r of rows) console.log(line(r));
  };
  console.log(`\n${PERIOD_LABELS[period]}: patterns`);
  print(['pattern', 'day', 'ends', 'role', 'paired by', 'round trips', 'hw', 'running', 'sched layover', 'recovery', 'cycle', 'scheduled now', 'implied at schedule', ...(targetHeadway != null ? [`at target ${targetHeadway}`] : []), 'notes'], patternRows);
  console.log(`\n${PERIOD_LABELS[period]}: routes (implied = sum over regular patterns of each leg's (running + recovery) x its departures per minute, rounded up once; pattern rows round each pattern up; partial trips counted in scheduled only)`);
  print(['route', 'day', 'map hw', 'patterns', 'scheduled now', 'implied', ...(targetHeadway != null ? [`at target ${targetHeadway}`] : [])], routeRows);
  if (extra.length) console.log(`\n${extra.join('\n')}`);
}
console.log('\nPull-out and pull-in between the garage and the route are not in GTFS and are not estimated.');

if (jsonOut) {
  const file: StudioVehiclesFile = { slug: slug ?? basename(zipPath, '.zip'), feed: basename(zipPath), referenceDate, periods: {} };
  for (const period of PERIOD_KEYS) {
    const routes = routeIds.flatMap(routeId => {
      const index = pickRepresentativeWeekday(countsByRoute.get(routeId)!, true);
      return index == null ? [] : [{ routeId, analysis: analysis(WEEKDAYS[index], period) }];
    });
    file.periods[period] = vehicleGroupRows(routes, nameOf);
  }
  mkdirSync(dirname(resolve(jsonOut)), { recursive: true });
  writeFileSync(resolve(jsonOut), `${JSON.stringify(file, null, 1)}\n`);
  console.error(`Wrote ${jsonOut}`);
}
