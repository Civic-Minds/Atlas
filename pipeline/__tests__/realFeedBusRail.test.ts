/**
 * End-to-end processing of a small real feed: MDOT MTA (Baltimore) bus route 69
 * as the main feed and the Metro SubwayLink as a supplemental, cut down from the
 * agencies' published GTFS (bus 2026-02-08..06-13, subway to 2026-12-31). See
 * fixtures/mdot-mta-bus-rail/. Guards the incident classes behind #623 (rail
 * supplemental dropped), #614 (stop data wiped) and #657 (drop guard), using
 * real station parents, entrances, pathway nodes and calendar_dates.
 *
 * Headway values are deliberately not pinned here: they belong to the
 * headway/calendar tests. These assertions are about what survives processing.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processAgencyFeeds, type AgencyFeedConfig, type AgencyFeedResult } from '../agencyFeeds.js';
import { countArtifacts, outputDropRefusal } from '../archiveSelection.js';
import { routeArtifactSchemaError } from '../../shared/artifactSchema.js';

const FIXTURE = join(import.meta.dirname, 'fixtures/mdot-mta-bus-rail');
const REPO = join(import.meta.dirname, '../..');
const SUBWAY_URL = 'https://mdotmta-gtfs.s3.amazonaws.com/mdotmta_gtfs_metro.zip';
const agency: AgencyFeedConfig = { slug: 'mta-maryland', supplementalFeedUrls: [SUBWAY_URL] };

async function zipFixture(name: string): Promise<Buffer> {
  const zip = new JSZip();
  for (const file of readdirSync(join(FIXTURE, name))) zip.file(file, readFileSync(join(FIXTURE, name, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

function fixtureRows(name: string, file: string): Array<Record<string, string>> {
  const [header, ...lines] = readFileSync(join(FIXTURE, name, file), 'utf8').trimEnd().split('\n');
  const cols = header.split(',');
  return lines.map(line => Object.fromEntries(line.split(',').map((v, i) => [cols[i], v])));
}

type Feature = { geometry: { type: string }; properties: Record<string, any> };
const routeLines = (result: AgencyFeedResult) =>
  (JSON.parse(result.geojson).features as Feature[]).filter(f => f.geometry.type === 'LineString');

let merged: AgencyFeedResult;
let busOnly: AgencyFeedResult;

beforeAll(async () => {
  // Pin the clock to a holiday-free Wednesday inside both feeds' calendars, so the
  // reference week never depends on the day the suite runs (#658).
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-03-04T12:00:00-05:00'));
  const bus = await zipFixture('bus');
  merged = await processAgencyFeeds(bus, [{ url: SUBWAY_URL, buf: await zipFixture('metro-subway') }], agency);
  busOnly = await processAgencyFeeds(bus, [], { slug: 'mta-maryland' });
});

afterAll(() => {
  vi.useRealTimers();
});

describe('real bus + rail supplemental feed (MDOT MTA)', () => {
  it('keeps both bus directions and both subway directions as drawn weekday routes', () => {
    const weekday = routeLines(merged).filter(f => f.properties.day === 'Weekday');
    const bus = weekday.filter(f => f.properties.routeShortName === '69');
    const subway = weekday.filter(f => f.properties.routeShortName === 'METRO SUBWAYLINK');
    expect(bus.map(f => f.properties.headsign).sort()).toEqual(['JUMPERS HOLE', 'PATAPSCO LIGHT RAIL']);
    expect(subway.map(f => f.properties.headsign).sort()).toEqual(['JOHNS HOPKINS STATION (METRO)', 'OWINGS MILLS STATION (METRO)']);
    expect(bus.every(f => f.properties.routeType === 3)).toBe(true);
    expect(subway.every(f => f.properties.routeType === 1)).toBe(true);
    expect(merged.supplementalFeatureCounts).toEqual([{ url: SUBWAY_URL, featureCount: expect.any(Number) }]);
    expect(merged.supplementalFeatureCounts[0].featureCount).toBeGreaterThan(0);
    expect(routeArtifactSchemaError(JSON.parse(merged.geojson))).toBeNull();
  });

  it('gives every drawn route a stop order with real per-stop headways, for bus and rail', () => {
    for (const f of routeLines(merged).filter(line => line.properties.day === 'Weekday')) {
      const { stopOrder, stopHeadways } = f.properties;
      expect(stopOrder.length, f.properties.headsign).toBeGreaterThan(10);
      const values = stopOrder.map((id: string) => stopHeadways?.[id]).filter((v: unknown) => v != null);
      expect(values.length, f.properties.headsign).toBeGreaterThan(stopOrder.length / 2);
      expect(values.every((v: number) => Number.isFinite(v) && v > 0), f.properties.headsign).toBe(true);
    }
  });

  it('writes real names and coordinates into stops.json and leaves out entrances and pathway nodes', () => {
    const stops = JSON.parse(merged.stopsJson) as Record<string, { name: string; lat: number; lon: number }>;
    for (const [feed, id] of [['metro-subway', '7500'], ['bus', '10922']] as const) {
      const source = fixtureRows(feed, 'stops.txt').find(row => row.stop_id === id)!;
      expect(stops[id]).toMatchObject({ name: source.stop_name, lat: Number(source.stop_lat), lon: Number(source.stop_lon) });
    }
    const servedPlatforms = new Set(fixtureRows('metro-subway', 'stop_times.txt').map(row => row.stop_id));
    const servedBusStops = new Set(fixtureRows('bus', 'stop_times.txt').map(row => row.stop_id));
    for (const id of [...servedPlatforms, ...servedBusStops]) expect(stops, id).toHaveProperty(id);
    for (const row of fixtureRows('metro-subway', 'stops.txt').filter(r => r.location_type === '2' || r.location_type === '3')) {
      expect(stops, row.stop_id).not.toHaveProperty(row.stop_id);
    }
  });

  it('lists every served stop once in stops-meta, with the routes that serve it', () => {
    const meta = JSON.parse(merged.stopsMetaJson) as { stopCount: number; stops: Array<{ id: string; routes: string[] }> };
    const ids = meta.stops.map(stop => stop.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(meta.stopCount).toBe(ids.length);
    expect(meta.stops.find(stop => stop.id === '7500')?.routes).toContain('METRO SUBWAYLINK');
    expect(meta.stops.find(stop => stop.id === '10922')?.routes).toContain('69');
  });

  it('keeps the subway when processed with the real mta-maryland registry options', async () => {
    const registry = JSON.parse(readFileSync(join(REPO, 'config/agencies/mta-maryland.json'), 'utf8')) as AgencyFeedConfig;
    const result = await processAgencyFeeds(
      await zipFixture('bus'),
      [{ url: SUBWAY_URL, buf: await zipFixture('metro-subway') }],
      { ...registry, supplementalFeedUrls: [SUBWAY_URL] },
    );
    expect(routeLines(result).some(f => f.properties.routeType === 1)).toBe(true);
  });

  it('a run that loses the rail supplemental is refused by the drop guard (#623, #657)', () => {
    const live = countArtifacts(merged.geojson, merged.stopsJson);
    const next = countArtifacts(busOnly.geojson, busOnly.stopsJson);
    expect(live.routes).toBe(2);
    expect(next.routes).toBe(1);
    expect(outputDropRefusal(live, next)).toMatch(/routes 2 -> 1/);
    expect(outputDropRefusal(live, live)).toBeNull();
  });
});

describe('registry options never filter out a supplemental feed', () => {
  // agencyProcessOptions hands the main feed's filters to every supplemental. A routeTypes
  // list without rail, or an agencyId that only matches the bus feed, would silently drop
  // the supplemental's routes with no error (#623 class).
  const RAIL_TYPES = [0, 1, 2, 12];
  const withSupplementals = readdirSync(join(REPO, 'config/agencies'))
    .filter(file => file.endsWith('.json') && file !== 'order.json')
    .map(file => JSON.parse(readFileSync(join(REPO, 'config/agencies', file), 'utf8')) as AgencyFeedConfig & { routeTypes?: number[] })
    .filter(config => (config.supplementalFeedUrls?.length ?? 0) > 0);

  it('finds the agencies that merge supplemental feeds', () => {
    expect(withSupplementals.map(config => config.slug)).toEqual(expect.arrayContaining(['lacmta', 'mta-maryland', 'nfta', 'septa', 'wmata']));
  });

  it.each(withSupplementals.map(config => [config.slug, config] as const))('%s keeps rail route types and sets no agencyId filter', (_slug, config) => {
    if (config.routeTypes) expect(config.routeTypes.some(type => RAIL_TYPES.includes(type))).toBe(true);
    expect(config.agencyId).toBeUndefined();
  });
});
