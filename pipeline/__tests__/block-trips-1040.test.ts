import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';
import { processAgencyFeeds } from '../agencyFeeds';

// Clemson Area Transit (#1040): its Red route is one trip per vehicle shift, only the first and
// last stop timed and every stop between blank. The first stop's time is the shift start (00:00,
// 07:00, ...), so the route read "every 21 min" on weekdays and "every 441 min" on Saturdays.
// `skipBlockTripHeadways` (Clemson only) gives a pattern made only of such trips no headway.
//
// B: block trips only (the reported case). M: hourly fully timed Sunday trips plus a 16:00 block
// trip, like Central. F: block trips given departures by frequencies.txt, like Gold. T: fully timed.

const RUN = new Date('2026-10-21T08:00:00');
const HEADER = 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date';

function clock(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
}

async function feed(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('agency.txt', 'agency_id,agency_name,agency_url,agency_timezone\na,Test,https://example.test,America/New_York\n');
  zip.file('routes.txt', 'route_id,route_short_name,route_long_name,route_type\nB,,Block,3\nM,,Mixed,3\nF,,Freq,3\nT,,Timed,3\n');
  const stops = ['stop_id,stop_name,stop_lat,stop_lon'];
  const shapes = ['shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence'];
  ['B', 'M', 'F', 'T'].forEach((r, i) => {
    const lat = 34.60 + i * 0.02;
    for (let s = 1; s <= 4; s++) stops.push(`${r}${s},${r} stop ${s},${lat},${-82.85 + s * 0.01}`);
    for (let s = 1; s <= 4; s++) shapes.push(`sh${r},${lat},${-82.85 + s * 0.01},${s}`);
  });
  zip.file('stops.txt', stops.join('\n') + '\n');
  zip.file('shapes.txt', shapes.join('\n') + '\n');
  zip.file('calendar.txt', [HEADER, 'wk,1,1,1,1,1,0,0,20260101,20301231', 'sun,0,0,0,0,0,0,1,20260101,20301231'].join('\n') + '\n');
  const trips = ['route_id,service_id,trip_id,trip_headsign,direction_id,shape_id'];
  const times = ['trip_id,arrival_time,departure_time,stop_id,stop_sequence'];
  const full = (id: string, r: string, m: number) => {
    for (let s = 1; s <= 4; s++) times.push(`${id},${clock(m + s * 5)},${clock(m + s * 5)},${r}${s},${s}`);
  };
  const block = (id: string, r: string, m: number) => {
    times.push(`${id},${clock(m)},${clock(m)},${r}1,1`, `${id},,,${r}2,2`, `${id},,,${r}3,3`, `${id},${clock(m + 600)},${clock(m + 600)},${r}4,4`);
  };
  // B: one shift every 20 minutes from 07:00 to 12:00 (Monday-Friday).
  for (let m = 420, i = 0; m <= 720; m += 20, i++) { trips.push(`B,wk,B${i},B end,0,shB`); block(`B${i}`, 'B', m); }
  // M: Sunday 12:00-15:00 hourly, fully timed; 16:00 is a block trip on the same pattern.
  for (let m = 720, i = 0; m <= 900; m += 60, i++) { trips.push(`M,sun,M${i},M end,0,shM`); full(`M${i}`, 'M', m); }
  trips.push('M,sun,Mlast,M end,0,shM'); block('Mlast', 'M', 960);
  // F: three block trips, departures from a frequencies.txt window (every 10 minutes, 07:00-10:00).
  for (let i = 0; i < 3; i++) { trips.push(`F,wk,F${i},F end,0,shF`); block(`F${i}`, 'F', 420); }
  zip.file('frequencies.txt', 'trip_id,start_time,end_time,headway_secs\nF0,07:00:00,10:00:00,600\n');
  // T: fully timed hourly, 07:00-16:00 (Monday-Friday).
  for (let m = 420, i = 0; m <= 960; m += 60, i++) { trips.push(`T,wk,T${i},T end,0,shT`); full(`T${i}`, 'T', m); }
  zip.file('trips.txt', trips.join('\n') + '\n');
  zip.file('stop_times.txt', times.join('\n') + '\n');
  return zip.generateAsync({ type: 'nodebuffer' });
}

type Props = Record<string, any>;
const lines = (geojson: string): Props[] => JSON.parse(geojson).features.map((f: any) => f.properties).filter((p: Props) => p.stopId == null);
const find = (props: Props[], route: string, day: string) => props.find(p => p.routeId === route && p.day === day);
const ofRoutes = (geojson: string, routes: string[]) =>
  JSON.stringify(JSON.parse(geojson).features.filter((f: any) => routes.includes(f.properties.routeId)));

describe('skipBlockTripHeadways (Clemson, #1040)', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'], now: RUN }); });
  afterEach(() => { vi.useRealTimers(); });

  it('without the switch, shift start times read as a frequency (the reported bug)', async () => {
    const result = await processGtfsBuffer(await feed(), undefined, { slug: 'test' });
    expect(find(lines(result.geojson), 'B', 'Weekday')?.headway).toBe(20);
  });

  it('with the switch, a pattern of only block trips has no headway and reads as one-off', async () => {
    const result = await processGtfsBuffer(await feed(), undefined, { slug: 'test', skipBlockTripHeadways: true });
    const b = find(lines(result.geojson), 'B', 'Weekday');
    expect(b).toBeDefined();
    expect(b?.headway).toBeNull();
    expect(b?.serviceClass).toBe('irregular');
    expect(b?.tier).toBe('span');
    // The stop-level numbers made from the same shift times are gone too.
    expect(b?.stopHeadways).toBeUndefined();
    expect(b?.headwayByPeriod?.midday ?? null).toBeNull();
  });

  it('keeps timed routes, a block trip inside a timed pattern, and frequencies.txt block trips byte-identical', async () => {
    const buf = await feed();
    const off = await processGtfsBuffer(buf, undefined, { slug: 'test' });
    const on = await processGtfsBuffer(buf, undefined, { slug: 'test', skipBlockTripHeadways: true });
    expect(ofRoutes(on.geojson, ['M', 'F', 'T'])).toBe(ofRoutes(off.geojson, ['M', 'F', 'T']));
    expect(find(lines(on.geojson), 'M', 'Sunday')?.headway).toBe(60);
    expect(find(lines(on.geojson), 'F', 'Weekday')?.headway).toBe(10);
    expect(find(lines(on.geojson), 'T', 'Weekday')?.headway).toBe(60);
    const stopsOff = JSON.parse(off.stopsJson);
    const stopsOn = JSON.parse(on.stopsJson);
    for (const id of Object.keys(stopsOff).filter(id => !id.startsWith('B'))) expect(stopsOn[id]).toEqual(stopsOff[id]);
    expect(on.tripsJson).toBe(off.tripsJson);
  });

  it('an agency without the switch gets the same output as before', async () => {
    const buf = await feed();
    const unset = await processGtfsBuffer(buf, undefined, { slug: 'test' });
    const off = await processGtfsBuffer(buf, undefined, { slug: 'test', skipBlockTripHeadways: false });
    expect(off.geojson).toBe(unset.geojson);
    expect(off.stopsJson).toBe(unset.stopsJson);
    // Through the agency config path: the switch is read from the agency, and absent it changes nothing.
    const viaAgencyOff = await processAgencyFeeds(buf, [], { slug: 'test' });
    expect(find(lines(viaAgencyOff.geojson), 'B', 'Weekday')?.headway).toBe(20);
    const heads = (g: string) => lines(g).map(p => `${p.routeId}|${p.day}|${p.headway}|${p.serviceClass}`).sort();
    expect(heads(viaAgencyOff.geojson)).toEqual(heads(unset.geojson));
    const viaAgencyOn = await processAgencyFeeds(buf, [], { slug: 'test', skipBlockTripHeadways: true });
    expect(find(lines(viaAgencyOn.geojson), 'B', 'Weekday')?.headway).toBeNull();
  });

  // The run-date half of #1040 needs no switch: reference-date stage 4 reads Clemson's current week (CIV-846, clemson-current-week.test.ts).
  it('only Clemson opts in', () => {
    const dir = resolve(__dirname, '../../config/agencies');
    const flagged = readdirSync(dir).filter(f => f.endsWith('.json'))
      .filter(f => JSON.parse(readFileSync(resolve(dir, f), 'utf8')).skipBlockTripHeadways === true);
    expect(flagged).toEqual(['clemson-cat.json']);
  });
});
