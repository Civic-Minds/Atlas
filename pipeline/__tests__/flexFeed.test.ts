/**
 * A fixed-route feed that also carries GTFS-Flex on-demand trips (stop_times rows
 * with location_id and pickup windows, no stop_id, plus locations.geojson), the
 * way Cascades East Transit publishes. Built on the real MDOT MTA route 69 fixture.
 * Atlas cannot map Flex zones, so processing must skip those rows with a warning,
 * not fail the feed and not change the fixed route.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer, type ProcessResult } from '../process-core.js';

const BUS = join(import.meta.dirname, 'fixtures/mdot-mta-bus-rail/bus');
const FLEX_TRIPS = 6;

function busZip(): JSZip {
  const zip = new JSZip();
  for (const file of readdirSync(BUS)) zip.file(file, readFileSync(join(BUS, file)));
  return zip;
}

function withFlexTrips(zip: JSZip): JSZip {
  const read = (file: string) => readFileSync(join(BUS, file), 'utf8').trimEnd();
  zip.file('routes.txt', `${read('routes.txt')}\nFLEX1,30034,Flex,South Baltimore on demand,3,,\n`);
  const flexTrips = Array.from({ length: FLEX_TRIPS }, (_, i) => `FLEX1,2221,flex${i},On demand zone,0,`);
  zip.file('trips.txt', `${read('trips.txt')}\n${flexTrips.join('\n')}\n`);
  const [header, ...rows] = read('stop_times.txt').split('\n');
  const flexRows = Array.from({ length: FLEX_TRIPS }, (_, i) =>
    `flex${i},,,,1,zone-south,${String(6 + i).padStart(2, '0')}:00:00,${String(7 + i).padStart(2, '0')}:00:00`);
  zip.file('stop_times.txt', [
    `${header},location_id,start_pickup_drop_off_window,end_pickup_drop_off_window`,
    ...rows.map(row => `${row},,,`),
    ...flexRows,
  ].join('\n') + '\n');
  zip.file('locations.geojson', JSON.stringify({
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      id: 'zone-south',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [[[-76.62, 39.15], [-76.6, 39.15], [-76.6, 39.17], [-76.62, 39.15]]] },
    }],
  }));
  return zip;
}

const lines = (result: ProcessResult) =>
  (JSON.parse(result.geojson).features as Array<{ geometry: { type: string }; properties: Record<string, any> }>)
    .filter(f => f.geometry.type === 'LineString');

let plain: ProcessResult;
let flex: ProcessResult;
const messages: string[] = [];

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-03-04T12:00:00-05:00'));
  plain = await processGtfsBuffer(await busZip().generateAsync({ type: 'nodebuffer' }), undefined, { slug: 'flex-fixture' });
  flex = await processGtfsBuffer(
    await withFlexTrips(busZip()).generateAsync({ type: 'nodebuffer' }),
    message => messages.push(message),
    { slug: 'flex-fixture' },
  );
});

afterAll(() => {
  vi.useRealTimers();
});

describe('feed with GTFS-Flex on-demand trips', () => {
  it('processes without failing validation and keeps the feed usable', () => {
    // processGtfsBuffer throws GtfsValidationError (and logs "N error(s)") on any validation error.
    expect(messages.some(m => /error\(s\)/.test(m))).toBe(false);
    expect(flex.feedQuality.status).not.toBe('unusable');
  });

  it('never turns a Flex zone into a route line or a stop', () => {
    expect(lines(flex).some(f => f.properties.routeShortName === 'Flex')).toBe(false);
    expect(JSON.parse(flex.stopsJson)).not.toHaveProperty('zone-south');
  });

  it('leaves the fixed route exactly as it is without the Flex rows', () => {
    const fixed = (result: ProcessResult) => lines(result).filter(f => f.properties.routeShortName === '69');
    expect(fixed(flex)).toHaveLength(2);
    expect(fixed(flex)).toEqual(fixed(plain));
    expect(flex.stopsJson).toBe(plain.stopsJson);
  });
});
