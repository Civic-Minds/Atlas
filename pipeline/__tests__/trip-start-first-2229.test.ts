import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';

// CIV-2229 (#1772, Ryan "1"): a route direction's first boarding is read where its trips start, over the whole day (the
// analysis window starts at 7 AM), and its last time stays at the reference stops.
const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;

async function feed(night = false): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('agency.txt', 'agency_id,agency_name,agency_url,agency_timezone\na,Test,https://example.test,America/Toronto\n');
  zip.file('routes.txt', 'route_id,route_short_name,route_long_name,route_type\nX,X,Route X,3\n');
  const stops = ['stop_id,stop_name,stop_lat,stop_lon'], shapes = ['shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence'];
  for (let s = 1; s <= 5; s++) { stops.push(`s${s},Stop ${s},44.2,${-76.5 + s * 0.01}`); shapes.push(`sh,44.2,${-76.5 + s * 0.01},${s}`); }
  const trips = ['route_id,service_id,trip_id,trip_headsign,direction_id,shape_id'], times = ['trip_id,arrival_time,departure_time,stop_id,stop_sequence'];
  // Every 30 min from 6:30 AM to 10:30 PM; each trip takes 40 min end to end.
  for (let m = 390, n = 0; m <= 1350; m += 30, n++) {
    trips.push(`X,wk,d${n},East,0,sh`);
    for (let s = 1; s <= 5; s++) times.push(`d${n},${clock(m + (s - 1) * 10)},${clock(m + (s - 1) * 10)},s${s},${s}`);
  }
  // #1791: an all-night route whose feed writes its after-midnight trips as 0:xx under a night-only service.
  if (night) for (const [n, m] of [15, 75, 135].entries()) {
    trips.push(`X,nt,n${n},East,0,sh`);
    for (let s = 1; s <= 5; s++) times.push(`n${n},${clock(m + (s - 1) * 10)},${clock(m + (s - 1) * 10)},s${s},${s}`);
  }
  zip.file('stops.txt', stops.join('\n') + '\n');
  zip.file('shapes.txt', shapes.join('\n') + '\n');
  zip.file('calendar.txt', 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nwk,1,1,1,1,1,0,0,20260801,20261231\n' + (night ? 'nt,1,1,1,1,1,0,0,20260801,20261231\n' : ''));
  zip.file('trips.txt', trips.join('\n') + '\n');
  zip.file('stop_times.txt', times.join('\n') + '\n');
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('first boarding (CIV-2229)', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-21T08:00:00') }); });
  afterEach(() => { vi.useRealTimers(); });

  it('reads the first trip start over the whole day, on every row of the direction', async () => {
    const result = await processGtfsBuffer(await feed(), undefined, { slug: 'test' });
    const rows = (JSON.parse(result.geojson).features as Array<{ properties: Record<string, unknown> }>).map(f => f.properties)
      .filter(p => p.routeId === 'X' && p.stopId == null && p.day === 'Weekday');
    expect(rows.length).toBeGreaterThan(0);
    for (const p of rows) expect(p.tripStartFirst).toBe(390);
  });

  it('#1791: reads the last boarding where trips start, not at the reference stops', async () => {
    const result = await processGtfsBuffer(await feed(), undefined, { slug: 'test' });
    const rows = (JSON.parse(result.geojson).features as Array<{ properties: Record<string, unknown> }>).map(f => f.properties)
      .filter(p => p.routeId === 'X' && p.stopId == null && p.day === 'Weekday');
    // The 10:30 PM trip is the last boarding; it passes the later stops up to 11:10 PM.
    for (const p of rows) expect(p.tripStartLast).toBe(1350);
  });

  it('#1791: a night service\'s 0:xx trips are read as the night they end, after midnight', async () => {
    const result = await processGtfsBuffer(await feed(true), undefined, { slug: 'test' });
    const rows = (JSON.parse(result.geojson).features as Array<{ properties: Record<string, unknown> }>).map(f => f.properties)
      .filter(p => p.routeId === 'X' && p.stopId == null && p.day === 'Weekday');
    expect(rows.length).toBeGreaterThan(0);
    // Its 0:15, 1:15 and 2:15 AM trips continue the evening: the last boarding is 2:15 AM, not the 10:30 PM trip.
    for (const p of rows) expect(p.tripStartLast).toBe(26 * 60 + 15);
  });
});
