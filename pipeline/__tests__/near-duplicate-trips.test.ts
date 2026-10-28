import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';
import { nearDuplicateTripIds } from '../nearDuplicateTrips';

// #1143: TTC 320 in the 2026-09-28 feed listed every weekday trip under services 1 and 2, both
// running Monday to Friday, the copies 0-1 minutes apart, so a bus every 5 read as every 2-3.

const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
const csv = (rows: string[][]) => rows.map(r => r.join(',')).join('\n') + '\n';

/** Route 320 every 5 min, 06:00-22:00, on service 1; `copy` repeats each trip on service 2, `shift` minutes later at its odd stops. */
async function feed(copy: { days: string; shift: number } | null): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('agency.txt', csv([['agency_id', 'agency_name', 'agency_url', 'agency_timezone'], ['a', 'A', 'https://example.com', 'America/Toronto']]));
  zip.file('routes.txt', csv([['route_id', 'agency_id', 'route_short_name', 'route_type'], ['320', 'a', '320', '3']]));
  zip.file('calendar.txt', csv([['service_id', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'start_date', 'end_date'],
    ['1', '1', '1', '1', '1', '1', '0', '0', '20260101', '20271231'],
    ['2', ...copy?.days.split('') ?? ['1', '1', '1', '1', '1', '0', '0'], '20260101', '20271231']]));
  const stops = Array.from({ length: 6 }, (_, i) => `s${i}`);
  zip.file('stops.txt', csv([['stop_id', 'stop_name', 'stop_lat', 'stop_lon'], ...stops.map((id, i) => [id, id, String(43.7 + i * 0.01), '-79.4'])]));
  zip.file('shapes.txt', csv([['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence'], ...stops.map((_, i) => ['S', String(43.7 + i * 0.01), '-79.4', String(i + 1)])]));
  const trips = [['route_id', 'service_id', 'trip_id', 'trip_headsign', 'direction_id', 'shape_id']];
  const times = [['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence']];
  for (let start = 360, n = 0; start <= 1320; start += 5, n++) {
    trips.push(['320', '1', `a${n}`, 'Terminal', '0', 'S']);
    stops.forEach((s, i) => times.push([`a${n}`, hm(start + i * 3), hm(start + i * 3), s, String(i + 1)]));
    if (copy) {
      trips.push(['320', '2', `b${n}`, 'Terminal', '0', 'S']);
      stops.forEach((s, i) => times.push([`b${n}`, hm(start + i * 3 + (i % 2 ? copy.shift : 0)), hm(start + i * 3 + (i % 2 ? copy.shift : 0)), s, String(i + 1)]));
    }
  }
  zip.file('trips.txt', csv(trips));
  zip.file('stop_times.txt', csv(times));
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function weekday(buf: Buffer) {
  const result = await processGtfsBuffer(buf, undefined, { slug: 'synthetic' });
  return JSON.parse(result.geojson).features.map((f: any) => f.properties).filter((p: any) => p.day === 'Weekday' && p.stopId == null)[0];
}

describe('near-duplicate trips under a second service (#1143)', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-14T12:00:00') }); });
  afterAll(() => { vi.useRealTimers(); });

  it('a copy a minute later on a second weekday service is dropped, so the route reads every 5', async () => {
    const line = await weekday(await feed({ days: '1111100', shift: 1 }));
    expect(line.headway).toBe(5);
  });

  it('matches the feed with no copy', async () => {
    const plain = await weekday(await feed(null));
    const copied = await weekday(await feed({ days: '1111100', shift: 1 }));
    expect(copied.headway).toBe(plain.headway);
    expect(copied.tier).toBe(plain.tier);
  });

  it('keeps a copy whose service also runs on days the first one does not, and copies 2 minutes apart', () => {
    const trips = [{ route_id: 'r', service_id: '1', trip_id: 'a', direction_id: '0' }, { route_id: 'r', service_id: '2', trip_id: 'b', direction_id: '0' }];
    const stopTimes = (bShift: number) => ['a', 'b'].flatMap(id => ['x', 'y'].map((stop, i) => ({ trip_id: id, stop_id: stop, stop_sequence: String(i + 1), arrival_time: '', departure_time: hm(600 + i * 5 + (id === 'b' && i === 1 ? bShift : 0)) })));
    const weekdays = new Map([['monday', new Set(['1', '2'])], ['saturday', new Set(['2'])]]);
    const monOnly = new Map([['monday', new Set(['1', '2'])]]);
    expect([...nearDuplicateTripIds({ trips, stopTimes: stopTimes(1) } as any, monOnly)]).toEqual(['b']);
    expect([...nearDuplicateTripIds({ trips, stopTimes: stopTimes(1) } as any, weekdays)]).toEqual([]);
    expect([...nearDuplicateTripIds({ trips, stopTimes: stopTimes(2) } as any, monOnly)]).toEqual([]);
    expect([...nearDuplicateTripIds({ trips, stopTimes: stopTimes(0) } as any, monOnly)]).toEqual([]); // exact copies: same-minute dedupe
  });
});
