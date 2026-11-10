import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { parentStationProps, processGtfsBuffer } from '../process-core';

// CIV-1305: stop points carry their GTFS parent_station (and its name) so stop cards can keep a
// station's platforms together. Additive: no other field changes.

describe('parentStationProps', () => {
  const names = new Map([['STN', 'Union Station'], ['P1', 'Union Platform 1']]);
  it('gives a child its parent id and the parent name', () => {
    expect(parentStationProps({ parent_station: 'STN', location_type: '0' }, names)).toEqual({ parentStation: 'STN', parentStationName: 'Union Station' });
  });
  it('keeps the id but no name when the parent is missing from stops.txt', () => {
    expect(parentStationProps({ parent_station: 'GONE' }, names)).toEqual({ parentStation: 'GONE' });
  });
  it('gives nothing to a stop with no parent, or to a parent itself', () => {
    expect(parentStationProps({ parent_station: '' }, names)).toEqual({});
    expect(parentStationProps({}, names)).toEqual({});
    expect(parentStationProps({ parent_station: 'X', location_type: '1' }, names)).toEqual({});
  });
});

async function zip(files: Record<string, string>): Promise<Buffer> {
  const z = new JSZip();
  for (const [name, body] of Object.entries(files)) z.file(name, body);
  return z.generateAsync({ type: 'nodebuffer' });
}

function feed(): Record<string, string> {
  const stops = [
    'stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station',
    'STN,Union Station,43.6450,-79.3806,1,',
    'P1,Union Platform 1,43.6451,-79.3807,0,STN',
    'P2,Union Platform 2,43.6449,-79.3805,0,STN',
    'ORPHAN,Front St,43.6470,-79.3780,0,MISSING',
    'A,King St,43.6490,-79.3760,0,',
    'B,Queen St,43.6520,-79.3730,0,',
  ];
  const trips = ['route_id,service_id,trip_id,direction_id,trip_headsign'];
  const times = ['trip_id,arrival_time,departure_time,stop_id,stop_sequence'];
  const seq0 = ['P1', 'ORPHAN', 'A', 'B'];
  const seq1 = ['B', 'A', 'ORPHAN', 'P2'];
  for (let i = 0; i < 40; i++) {
    for (const [dir, seq] of [[0, seq0], [1, seq1]] as const) {
      const id = `T${dir}-${i}`;
      trips.push(`R1,WK,${id},${dir},${dir === 0 ? 'Queen' : 'Union'}`);
      const start = 6 * 60 + i * 15;
      seq.forEach((s, k) => {
        const m = start + k * 3; const t = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
        times.push(`${id},${t},${t},${s},${k + 1}`);
      });
    }
  }
  return {
    'agency.txt': 'agency_id,agency_name,agency_url,agency_timezone\nX,Test,https://example.com,America/Toronto\n',
    'routes.txt': 'route_id,agency_id,route_short_name,route_long_name,route_type\nR1,X,1,Test,3\n',
    'calendar.txt': 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWK,1,1,1,1,1,0,0,20261001,20261231\n',
    'stops.txt': stops.join('\n') + '\n',
    'trips.txt': trips.join('\n') + '\n',
    'stop_times.txt': times.join('\n') + '\n',
  };
}

describe('stop points carry parentStation through processing (CIV-1305)', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-03T12:00:00') }); });
  afterAll(() => { vi.useRealTimers(); });
  it('adds the two keys only where stops.txt has a parent, and only to children', async () => {
    const result = await processGtfsBuffer(await zip(feed()), undefined, { slug: 'test' });
    const points = new Map(JSON.parse(result.geojson).features
      .filter((f: any) => f.geometry?.type === 'Point')
      .map((f: any) => [f.properties.stopId, f.properties]));
    expect(points.get('P1')).toMatchObject({ parentStation: 'STN', parentStationName: 'Union Station' });
    expect(points.get('P2')).toMatchObject({ parentStation: 'STN', parentStationName: 'Union Station' });
    expect(points.get('ORPHAN')?.parentStation).toBe('MISSING');
    expect('parentStationName' in (points.get('ORPHAN') as object)).toBe(false);
    for (const id of ['A', 'B', 'STN']) {
      const p = points.get(id) as Record<string, unknown> | undefined;
      expect(p).toBeDefined();
      expect('parentStation' in p!).toBe(false);
      expect('parentStationName' in p!).toBe(false);
    }
  });
});
