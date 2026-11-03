/**
 * Builds the Bustang connection check's data (CIV-101): src/data/bustangConnections.json.
 *
 *   npx tsx scripts/build-bustang-connections.ts [--from YYYYMMDD] [--zips tmp/connections/zips] [--hub bustang]
 *
 * Read-only. Each agency's feed is the archived zip Atlas published (gtfs/archive/<slug>/, read
 * from R2, never written), checked against the config's recorded feed version and expiry, and
 * cached in --zips. The hub agency's stops are matched to every other agency in the same region
 * within each distance choice (200, 400 and 800 m); each hub arrival gets its wait for the next local departure from the
 * shared connectionWaits. One real date per day type: the first Wednesday, Saturday and Sunday
 * after --from (default today). The code works for any hub agency; v1 is run for Bustang only.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConnectionFeed, readDateFor, runsOn, type ConnectionFeed, type FeedStop } from '../pipeline/connectionTimetables.js';
import { nextDateWithDow, addDaysYmd } from '../pipeline/serviceDates.js';
import { connectionWaits, departuresWithin, distanceMeters, MAX_NEARBY_METERS, NEARBY_CHOICES, type HubArrival, type LocalDeparture } from '../shared/connections.js';
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

// Hub stops grouped by parent station (Denver Union Station's gates), else one stop each.
const alightStops = new Set<string>();
for (const date of Object.values(hubReadDates)) for (const e of hubFeed.eventsOn(date, new Set(hubFeed.stops.map(s => s.stopId)))) if (e.canAlight) alightStops.add(e.stopId);
const groups = new Map<string, FeedStop[]>();
for (const s of hubFeed.stops) {
  if (!alightStops.has(s.stopId)) continue;
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
    const arrivals: HubArrival[] = hubFeed.eventsOn(hubDate, new Set(hubStops.map(s => s.stopId)))
      .filter(e => e.canAlight)
      .map(e => ({ time: Math.round(e.arrival), routeName: e.routeName }));
    const departures: LocalDeparture[] = [];
    const readDates: Record<string, string> = {};
    for (const agency of agenciesHere) {
      const readDate = readDateFor(agency.feed, dates[key], agency.expiry);
      readDates[agency.config.slug] = readDate;
      const byStop = new Map(nearby.filter(n => n.agency === agency).map(n => [n.stop.stopId, n]));
      for (const e of agency.feed.eventsOn(readDate, new Set(byStop.keys()))) {
        if (!e.canBoard) continue;
        const n = byStop.get(e.stopId)!;
        departures.push({ time: Math.round(e.departure), agencySlug: agency.config.slug, routeName: e.routeName, stopName: n.stop.name, distanceM: n.distanceM });
      }
    }
    days[key] = {
      hubDate,
      readDates,
      // One set of waits per distance choice, each from the shared function on the departures within it.
      waits: Object.fromEntries(NEARBY_CHOICES.map(m => [m, connectionWaits(arrivals, departuresWithin(departures, m))])),
    };
  }
  const first = hubStops[0];
  stopsOut.push({
    id: groupId,
    name: hubStops.length > 1 ? commonName(hubStops.map(s => s.name)) : first.name,
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
};
writeFileSync(OUT, `${JSON.stringify(out)}\n`);
console.log(`wrote ${OUT}: ${stopsOut.length} stops, ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
