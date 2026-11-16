#!/usr/bin/env npx tsx
/**
 * CIV-1685: buses needed to run each route at a headway, from the agency's own schedule.
 * Local only: reads a GTFS zip, writes nothing (no R2, no registry, no files).
 *
 * Usage:
 *   npx tsx scripts/vehicles-needed.ts <feed.zip> [--slug <slug>] [--headway <min>] [--period <key>]
 *     [--route <short name>] [--anchor YYYYMMDD]
 *
 * --slug     reads config/agencies/<slug>.json so preprocess and excludes match the map.
 * --anchor   the rider-week anchor (default: today), for an archived feed whose service has ended.
 *
 * The current headway is the map's own route value (worstDirectionHeadwayByPeriod on the Weekday
 * features), read from processGtfsBuffer, so it matches what the map shows. The day counted is the
 * route's representative weekday (pickRepresentativeWeekday) in the week the map reads.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { processGtfsBuffer, type ProcessOptions } from '../pipeline/process-core.js';
import { agencyProcessOptions, type AgencyFeedConfig } from '../pipeline/agencyFeeds.js';
import { pickRepresentativeWeekday } from '../pipeline/representativeWeekday.js';
import { tripRunsForDay, vehiclesByRoute, vehiclesForHeadway, type RoutePeriodVehicles } from '../pipeline/vehiclesNeeded.js';
import { PERIOD_KEYS, PERIOD_LABELS, PERIOD_MINUTES, type HeadwayByPeriod, type PeriodKey } from '../shared/config.js';
import { WEEKDAYS, type DayName, type GtfsData } from '../types/gtfs.js';

const args = process.argv.slice(2);
function option(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}
const optionNames = new Set(['--slug', '--headway', '--period', '--route', '--anchor']);
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
  if (!runsByServiceKey.has(key)) runsByServiceKey.set(key, tripRunsForDay(gtfs, ids));
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
const vehiclesByDay = new Map<DayName, Map<string, RoutePeriodVehicles[]>>();
const vehiclesOn = (day: DayName) => {
  if (!vehiclesByDay.has(day)) vehiclesByDay.set(day, vehiclesByRoute(runsByDay.get(day)!));
  return vehiclesByDay.get(day)!;
};

const shortNameOf = new Map((gtfs.routes ?? []).map(r => [r.route_id, r.route_short_name || r.route_long_name || r.route_id]));
const rows: string[][] = [];
const header = ['route', 'day', 'period', 'current hw', 'cycle min', 'layover', 'scheduled now', 'implied at current', 'all-trip hw', 'implied at all-trip', ...(targetHeadway != null ? [`at ${targetHeadway} min`] : []), 'notes'];
const routeIds = [...countsByRoute.keys()].sort((a, b) => (shortNameOf.get(a) ?? a).localeCompare(shortNameOf.get(b) ?? b, undefined, { numeric: true }));
for (const routeId of routeIds) {
  const shortName = shortNameOf.get(routeId) ?? routeId;
  if (routeFilter && shortName !== routeFilter) continue;
  const index = pickRepresentativeWeekday(countsByRoute.get(routeId)!, true);
  if (index == null) continue;
  const day = WEEKDAYS[index];
  const map = mapHeadway.get(routeId);
  for (const v of vehiclesOn(day).get(routeId) ?? []) {
    if (!periods.includes(v.period)) continue;
    if (v.departures === 0 && v.scheduledVehicles === 0) continue;
    const current = map?.byPeriod[v.period] ?? null;
    // Diagnostic only, not a map number: the period's length over its departures per direction,
    // so a branched route (whose map value is its slowest pattern) can be checked against all its trips.
    const { start, end } = PERIOD_MINUTES[v.period];
    const perDirection = v.oneWay ? v.departures : v.departures / 2;
    const allTripHw = perDirection > 0 ? (end - start) / perDirection : null;
    const notes = [
      map == null ? 'not on map' : '',
      map && map.patterns.size > 2 ? `${map.patterns.size} patterns` : '',
      v.oneWay ? 'one direction' : '',
      v.layoverIncluded ? `${v.cycleSamples} samples` : '',
    ].filter(Boolean).join('; ');
    rows.push([
      shortName,
      day.slice(0, 3),
      PERIOD_LABELS[v.period],
      current != null ? String(current) : '-',
      v.cycleMin != null ? String(Math.round(v.cycleMin)) : '-',
      v.cycleMin == null ? '-' : v.layoverIncluded ? 'incl' : 'excl',
      `${v.scheduledVehicles}${v.scheduledBasis === 'trips' ? ' (trips)' : ''}`,
      String(vehiclesForHeadway(v.cycleMin, current) ?? '-'),
      allTripHw != null ? allTripHw.toFixed(1) : '-',
      String(vehiclesForHeadway(v.cycleMin, allTripHw) ?? '-'),
      ...(targetHeadway != null ? [String(vehiclesForHeadway(v.cycleMin, targetHeadway) ?? '-')] : []),
      notes,
    ]);
  }
}

const widths = header.map((h, i) => Math.max(h.length, ...rows.map(r => r[i].length)));
const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join(' | ');
console.log(`Feed ${zipPath}${slug ? ` (${slug})` : ''}, reference date ${referenceDate}${result.serviceWeekStart ? `, week of ${result.serviceWeekStart}` : ''}`);
console.log('"all-trip hw" is a diagnostic (period length / departures per direction), not a map value');
console.log('cycle "incl" = from block_id chains (layover included); "excl" = run times only, layover excluded');
console.log(line(header));
console.log(widths.map(w => '-'.repeat(w)).join('-|-'));
for (const r of rows) console.log(line(r));
