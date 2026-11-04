/**
 * Builds the Bustang connection check's data (CIV-101): src/data/bustangConnections.json.
 *
 *   npx tsx scripts/build-bustang-connections.ts [--from YYYYMMDD] [--zips tmp/connections/zips] [--hub bustang]
 *
 * Read-only. Each agency's feed is the archived zip Atlas published (gtfs/archive/<slug>/, read
 * from R2, never written), checked against the config's recorded feed version and expiry, and
 * cached in --zips. The hub agency's stops are matched to every other agency in the same region
 * within each distance choice (200, 400 and 800 m); each hub arrival gets its wait for the next local departure from the
 * shared connectionWaits, and each local route its count of Bustang trips met within 15, 30 and 60 min on both sides
 * (getting off Bustang: local departures after each arrival; catching Bustang: local drop-offs before each departure),
 * from the shared routeConnections. A local bus that ends its trip within a few stops (or, catching Bustang, started
 * only a few stops before) is left out (countsAsConnection). Each Bustang trip is also kept with every stop it serves
 * and, at each, the local routes that meet it within 60 min on both sides (tripStopConnections), for the route card's
 * departure list. One real date per day type: the first Wednesday, Saturday and Sunday
 * after --from (default today). The code works for any hub agency; v1 is run for Bustang only.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConnectionFeed, readDateFor, runsOn, type ConnectionFeed, type FeedStop } from '../pipeline/connectionTimetables.js';
import { nextDateWithDow, addDaysYmd } from '../pipeline/serviceDates.js';
import { connectionWaits, countsAsConnection, departuresWithin, distanceMeters, MAX_NEARBY_METERS, NEARBY_CHOICES, routeConnections, tripStopConnections, type HubArrival, type LocalDeparture } from '../shared/connections.js';
import type { StopEvent } from '../pipeline/connectionTimetables.js';
import { agencyShortLabel } from '../shared/agencyPages.js';
import { effectiveFeedExpiry, todayUtcYmd } from '../shared/feedAvailability.js';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const HUB = arg('--hub') ?? 'bustang';
const ZIPS = arg('--zips') ?? 'tmp/connections/zips';
const FROM = arg('--from') ?? todayUtcYmd();
const OUT = arg('--out') ?? 'src/data/bustangConnections.json';

interface AgencyConfig {
  slug: string;
  officialName?: string;
  nameQualifier?: string;
  region?: string;
  parentAgency?: string;
  agencyId?: string;
  excludeRouteShortNames?: string[];
  onDemandRoutes?: string[];
  staged?: boolean;
  hiddenInProduction?: boolean;
  lastFeedVersion?: string | null;
  lastFeedExpiry?: string | null;
  lastSupplementalFeeds?: Array<{ feedExpiry: string | null; feedVersion: string | null; rawArchiveKey: string | null }>;
}

const configs: AgencyConfig[] = readdirSync('config/agencies')
  .filter(f => f.endsWith('.json') && f !== 'order.json')
  .map(f => JSON.parse(readFileSync(join('config/agencies', f), 'utf8')) as AgencyConfig);
const hub = configs.find(c => c.slug === HUB);
if (!hub) throw new Error(`no agency ${HUB}`);
// Every other agency in the hub's region, leaving out the hub's own family (Bustang Outrider is CDOT too).
const locals = configs.filter(c => c.slug !== hub.slug && c.region === hub.region && !c.staged && !c.hiddenInProduction
  && (c.parentAgency ?? c.slug) !== (hub.parentAgency ?? hub.slug) && !(c.lastSupplementalFeeds?.length));

async function zipFor(c: AgencyConfig): Promise<Buffer> {
  const path = join(ZIPS, `${c.slug}.zip`);
  if (existsSync(path)) return readFileSync(path);
  // Lazy: only reach R2 (read-only) when the cache lacks a zip.
  const { r2ListArchiveObjects, r2GetArchiveBuffer } = await import('../pipeline/r2.js');
  const { peekFeedDates } = await import('../pipeline/archiveSelection.js');
  await import('../pipeline/loadEnv.js');
  const objs = (await r2ListArchiveObjects(`gtfs/archive/${c.slug}/`)).filter(o => o.key.endsWith('.zip'))
    .sort((a, b) => (b.lastModified?.getTime() ?? 0) - (a.lastModified?.getTime() ?? 0));
  for (const o of objs.slice(0, 8)) {
    const buf = await r2GetArchiveBuffer(o.key);
    if (!buf) continue;
    const { feedVersion } = await peekFeedDates(buf);
    if ((c.lastFeedVersion ?? null) === feedVersion) {
      mkdirSync(ZIPS, { recursive: true });
      writeFileSync(path, buf);
      return buf;
    }
  }
  throw new Error(`${c.slug}: no archived zip matches the published feed version ${c.lastFeedVersion}`);
}

const displayName = (c: AgencyConfig) => c.officialName ?? c.slug;
const DAY_TYPES = [
  { key: 'Weekday', dow: 3 },
  { key: 'Saturday', dow: 6 },
  { key: 'Sunday', dow: 0 },
] as const;

const hubFeed = await loadConnectionFeed(await zipFor(hub), hub);
const hubExpiry = effectiveFeedExpiry(hub);
const start = addDaysYmd(FROM, 1);
const dates = Object.fromEntries(DAY_TYPES.map(d => [d.key, nextDateWithDow(start, d.dow)])) as Record<(typeof DAY_TYPES)[number]['key'], string>;
// The hub's own schedule is read the same way as a local one: past its end, its last same-weekday timetable
// (labelled outdated on the page), never a date it doesn't cover.
const hubReadDates = Object.fromEntries(DAY_TYPES.map(d => [d.key, readDateFor(hubFeed, dates[d.key], hubExpiry)])) as typeof dates;
for (const { key } of DAY_TYPES) {
  if (!runsOn(hubFeed, hubReadDates[key])) console.warn(`${hub.slug} has no service on ${key} ${hubReadDates[key]}`);
}

// Hub stops grouped by parent station (Denver Union Station's gates), else one stop each: every stop riders can get
// off or on at (a pickup-only stop has only the catching side).
const servedStops = new Set<string>();
for (const date of Object.values(hubReadDates)) for (const e of hubFeed.eventsOn(date, new Set(hubFeed.stops.map(s => s.stopId)))) if (e.canAlight || e.canBoard) servedStops.add(e.stopId);
const groups = new Map<string, FeedStop[]>();
for (const s of hubFeed.stops) {
  if (!servedStops.has(s.stopId)) continue;
  const key = s.parentStation ?? s.stopId;
  groups.set(key, [...(groups.get(key) ?? []), s]);
}

interface LocalLoaded { config: AgencyConfig; feed: ConnectionFeed; expiry: string | null }
const loaded: LocalLoaded[] = [];
for (const c of locals) {
  const feed = await loadConnectionFeed(await zipFor(c), c);
  loaded.push({ config: c, feed, expiry: effectiveFeedExpiry(c) });
  console.log(`read ${c.slug}`);
}

const stopsOut = [];
// Each kept group's local buses per day, for the per-trip connections below.
const localByGroup = new Map<string, Record<string, { departures: LocalDeparture[]; dropOffs: LocalDeparture[] }>>();
const rifleCheck: string[] = [];
for (const [groupId, hubStops] of groups) {
  // Other agencies' served stops within the widest choice of any of the group's stops, at their nearest distance.
  const nearby: Array<{ agency: LocalLoaded; stop: FeedStop; distanceM: number }> = [];
  for (const agency of loaded) {
    for (const stop of agency.feed.stops) {
      if (!agency.feed.boardingStopIds.has(stop.stopId)) continue;
      const d = Math.min(...hubStops.map(h => distanceMeters(h, stop)));
      if (d <= MAX_NEARBY_METERS) nearby.push({ agency, stop, distanceM: Math.round(d) });
    }
  }
  if (nearby.length === 0) continue;
  const agenciesHere = [...new Set(nearby.map(n => n.agency))];
  const agenciesWithin = Object.fromEntries(NEARBY_CHOICES.map(m => [m, agenciesHere
    .filter(a => nearby.some(n => n.agency === a && n.distanceM <= m)).map(a => a.config.slug)]));
  const days: Record<string, unknown> = {};
  for (const { key } of DAY_TYPES) {
    const hubDate = hubReadDates[key];
    const hubEvents = hubFeed.eventsOn(hubDate, new Set(hubStops.map(s => s.stopId)));
    const arrivals: HubArrival[] = hubEvents.filter(e => e.canAlight).map(e => ({ time: Math.round(e.arrival), routeName: e.routeName }));
    const hubDepartures: HubArrival[] = hubEvents.filter(e => e.canBoard).map(e => ({ time: Math.round(e.departure), routeName: e.routeName }));
    const departures: LocalDeparture[] = [];
    // Local buses riders can get off, for the catching side: their arrival time at the nearby stop.
    const dropOffs: LocalDeparture[] = [];
    const readDates: Record<string, string> = {};
    for (const agency of agenciesHere) {
      const readDate = readDateFor(agency.feed, dates[key], agency.expiry);
      readDates[agency.config.slug] = readDate;
      const byStop = new Map(nearby.filter(n => n.agency === agency).map(n => [n.stop.stopId, n]));
      for (const e of agency.feed.eventsOn(readDate, new Set(byStop.keys()))) {
        const n = byStop.get(e.stopId)!;
        const at = { agencySlug: agency.config.slug, routeName: e.routeName, stopName: n.stop.name, distanceM: n.distanceM };
        if (e.canBoard && countsAsConnection('after', e)) departures.push({ time: Math.round(e.departure), ...at });
        if (e.canAlight && countsAsConnection('before', e)) dropOffs.push({ time: Math.round(e.arrival), ...at });
      }
    }
    const perDay = localByGroup.get(groupId) ?? {};
    perDay[key] = { departures, dropOffs };
    localByGroup.set(groupId, perDay);
    // The longest wait after an arrival, logged for checking against the raw schedules (Rifle weekday at 400 m).
    const longest = Math.max(-1, ...connectionWaits(arrivals, departuresWithin(departures, 400)).map(w => w.waitMin ?? -1));
    rifleCheck.push(`${key} ${hubStops[0].name}: longest wait at 400 m ${longest < 0 ? 'none' : `${longest} min`}`);
    days[key] = {
      hubDate,
      readDates,
      arrivals: arrivals.length,
      // Each local route once per side, with its counts within 15, 30 and 60 min.
      routes: Object.fromEntries(NEARBY_CHOICES.map(m => [m, {
        after: routeConnections(arrivals, departuresWithin(departures, m), 'after'),
        before: routeConnections(hubDepartures, departuresWithin(dropOffs, m), 'before'),
      }])),
      departures: hubDepartures.length,
    };
  }
  const first = hubStops[0];
  stopsOut.push({
    id: groupId,
    // The member stop ids, so a stop picked on the map finds its group (a station's gates).
    stopIds: hubStops.map(s => s.stopId),
    // A station's gates read as the station; a single stop keeps its own name.
    name: hubFeed.stationNames.get(groupId) || (hubStops.length > 1 ? commonName(hubStops.map(s => s.name)) : first.name),
    lat: first.lat,
    lon: first.lon,
    agencies: agenciesWithin,
    days,
  });
}

function commonName(names: string[]): string {
  let prefix = names[0];
  for (const n of names) while (!n.startsWith(prefix)) prefix = prefix.slice(0, -1);
  return prefix.replace(/[\s\-–,]*(Gate|Bay)?\s*$/i, '').trim() || names[0];
}

// The short name the agency pages use ("RTD", "Mountain Metro", "RFTA"), else the official name.
const pageNames = new Map((JSON.parse(readFileSync('shared/data/agency-pages.json', 'utf8')).agencies as Array<{ slug: string; displayName: string }>)
  .map(a => [a.slug, agencyShortLabel(a)]));
const shortName = (c: AgencyConfig) => pageNames.get(c.slug) ?? displayName(c);

// Each Bustang trip that day with every kept stop it serves, and the local routes meeting it there within 60 min on each
// side: [route index, wait at 200, 400 and 800 m] (null where the route is not within that distance or not within 60).
const stopIndex = new Map(stopsOut.map((s, i) => [s.id, i]));
const stopOfHubStop = new Map<string, string>();
for (const [groupId, hubStops] of groups) for (const s of hubStops) stopOfHubStop.set(s.stopId, groupId);
const routeTable: Array<[string, string]> = [];
const routeIndex = new Map<string, number>();
const routeRef = (agencySlug: string, routeName: string) => {
  const k = `${agencySlug}\u0000${routeName}`;
  if (!routeIndex.has(k)) { routeIndex.set(k, routeTable.length); routeTable.push([agencySlug, routeName]); }
  return routeIndex.get(k)!;
};
function sideWaits(time: number, local: LocalDeparture[], side: 'after' | 'before'): Array<[number, number | null, number | null, number | null]> {
  const at = NEARBY_CHOICES.map(m => new Map(tripStopConnections(time, departuresWithin(local, m), side).map(r => [`${r.agencySlug}\u0000${r.routeName}`, r])));
  const widest = at[at.length - 1];
  return [...widest.values()].map(r => {
    const k = `${r.agencySlug}\u0000${r.routeName}`;
    return [routeRef(r.agencySlug, r.routeName), ...at.map(m => m.get(k)?.waitMin ?? null)] as [number, number | null, number | null, number | null];
  });
}
const tripsOut: Record<string, unknown[]> = {};
for (const { key } of DAY_TYPES) {
  const events = hubFeed.eventsOn(hubReadDates[key], new Set([...stopOfHubStop.keys()]));
  const byTrip = new Map<string, StopEvent[]>();
  for (const e of events) byTrip.set(e.tripId, [...(byTrip.get(e.tripId) ?? []), e]);
  const list = [];
  for (const [tripId, tripEvents] of byTrip) {
    tripEvents.sort((a, b) => a.departure - b.departure);
    const first = tripEvents[0];
    list.push({
      id: tripId,
      routeId: first.routeId,
      routeName: first.routeName,
      headsign: first.headsign,
      stops: tripEvents.filter(e => stopIndex.has(stopOfHubStop.get(e.stopId)!)).map(e => {
        const groupId = stopOfHubStop.get(e.stopId)!;
        const local = localByGroup.get(groupId)?.[key];
        return {
          stop: stopIndex.get(groupId),
          arrival: Math.round(e.arrival),
          departure: Math.round(e.departure),
          // Getting off Bustang here (after it arrives) and catching it here (before it leaves).
          after: e.canAlight && local ? sideWaits(Math.round(e.arrival), local.departures, 'after') : null,
          before: e.canBoard && local ? sideWaits(Math.round(e.departure), local.dropOffs, 'before') : null,
        };
      }),
    });
  }
  tripsOut[key] = list.filter(t => t.stops.length > 0).sort((a, b) => a.stops[0].departure - b.stops[0].departure);
}
console.log(rifleCheck.filter(l => /Rifle/.test(l)).join('\n'));

const usedAgencies = new Set(stopsOut.flatMap(s => s.agencies[MAX_NEARBY_METERS]));
const out = {
  builtFrom: FROM,
  nearbyChoices: NEARBY_CHOICES,
  hub: { slug: hub.slug, name: shortName(hub), feedVersion: hub.lastFeedVersion ?? null, feedExpiry: hubExpiry },
  dates,
  agencies: Object.fromEntries(loaded.filter(a => usedAgencies.has(a.config.slug)).map(a => [a.config.slug, {
    name: shortName(a.config), feedVersion: a.config.lastFeedVersion ?? null, feedExpiry: a.expiry,
  }])),
  stops: stopsOut,
  routes: routeTable,
  trips: tripsOut,
};
writeFileSync(OUT, `${JSON.stringify(out)}\n`);
console.log(`wrote ${OUT}: ${stopsOut.length} stops, ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
