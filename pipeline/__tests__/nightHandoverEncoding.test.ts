import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';
import { directionNightVerdict, type DirectionStretches } from '../tripSets';

// CIV-1331 final review: the morning after a night depends on how the night's trips are written. Past 24:00 on the
// evening's service day (Saturday 25:00) is followed by the next day's morning (Sunday); 00:00-05:59 on the morning's
// own service day (Sunday 01:00, the #297 notation) is followed by that same day's morning. A made-up night-only
// route N ends at 3:20; a daytime route D stops 100 m away. Only the right morning's D may take over.

const hm = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
const range = (from: number, to: number, step: number) => { const out: number[] = []; for (let m = from; m <= to; m += step) out.push(m); return out; };

async function feed(nTrips: { service: string; at: number[] }, dTrips: Array<{ service: string; from: number; to?: number }>): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('agency.txt', 'agency_id,agency_name,agency_url,agency_timezone\nA,Made Up,https://example.com,America/Toronto\n');
  zip.file('routes.txt', 'route_id,agency_id,route_short_name,route_type\nN,A,N,3\nD,A,D,3\n');
  zip.file('stops.txt', 'stop_id,stop_name,stop_lat,stop_lon\na,A,43.6500,-79.4000\nb,B,43.6600,-79.4000\nc,C,43.6509,-79.4000\nd,D,43.6609,-79.4000\n');
  zip.file('calendar.txt', 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWKD,1,1,1,1,1,0,0,20260101,20271231\nSAT,0,0,0,0,0,1,0,20260101,20271231\nSUN,0,0,0,0,0,0,1,20260101,20271231\n');
  const trips = ['route_id,service_id,trip_id,direction_id'];
  const times = ['trip_id,arrival_time,departure_time,stop_id,stop_sequence'];
  const add = (route: string, service: string, start: number, stops: [string, string]) => {
    const id = `${route}-${service}-${start}`;
    trips.push(`${route},${service},${id},0`);
    times.push(`${id},${hm(Math.floor(start / 60), start % 60)},${hm(Math.floor(start / 60), start % 60)},${stops[0]},1`);
    const end = start + 4;
    times.push(`${id},${hm(Math.floor(end / 60), end % 60)},${hm(Math.floor(end / 60), end % 60)},${stops[1]},2`);
  };
  for (const at of nTrips.at) add('N', nTrips.service, at, ['a', 'b']);
  for (const { service, from, to = 22 * 60 } of dTrips) for (const at of range(from, to, 20)) add('D', service, at, ['c', 'd']);
  zip.file('trips.txt', trips.join('\n') + '\n');
  zip.file('stop_times.txt', times.join('\n') + '\n');
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function nightVerdict(buffer: Buffer, key: string): Promise<string> {
  let stretches: ReadonlyMap<string, DirectionStretches> | null = null;
  await processGtfsBuffer(buffer, undefined, { slug: 'madeup', onStretches: input => { stretches = input.stretches; } });
  return directionNightVerdict(stretches!.get(key)!, 90);
}

beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-20T12:00:00') }); });
afterAll(() => { vi.useRealTimers(); });
vi.setConfig({ testTimeout: 30_000 });

describe('night handover reads the morning after, in both notations (CIV-1331)', () => {
  const extended = { service: 'SAT', at: range(25 * 60, 27 * 60 + 20, 20) }; // Saturday 1:00-3:20, written 25:00-27:20
  const plain = { service: 'SUN', at: range(60, 3 * 60 + 20, 20) }; // the same night, written 01:00-03:20 on Sunday

  it('Saturday night written past 24:00: Sunday morning takes over', async () => {
    expect(await nightVerdict(await feed(extended, [{ service: 'SUN', from: 4 * 60 + 30 }, { service: 'SAT', from: 7 * 60 }, { service: 'WKD', from: 7 * 60 }]), 'N::0::Saturday')).toBe('pass');
  });
  it("Saturday night written past 24:00: Saturday's own early buses (the night before) do not", async () => {
    expect(await nightVerdict(await feed(extended, [{ service: 'SAT', from: 4 * 60 + 30 }, { service: 'SUN', from: 7 * 60 }, { service: 'WKD', from: 7 * 60 }]), 'N::0::Saturday')).toBe('fail');
  });
  it("Saturday night written on Sunday's own day (01:00-03:20): Sunday morning takes over", async () => {
    expect(await nightVerdict(await feed(plain, [{ service: 'SUN', from: 4 * 60 + 30 }, { service: 'SAT', from: 7 * 60 }, { service: 'WKD', from: 7 * 60 }]), 'N::0::Sunday')).toBe('pass');
  });
  it("Saturday night written on Sunday's own day: Monday's early buses do not", async () => {
    expect(await nightVerdict(await feed(plain, [{ service: 'WKD', from: 4 * 60 + 30 }, { service: 'SUN', from: 7 * 60 }, { service: 'SAT', from: 7 * 60 }]), 'N::0::Sunday')).toBe('fail');
  });

  // CIV-1331: early-morning and peak routes are the ones that take over. N ends at 3:40 here (80 minutes before 5:00).
  const endsAt340 = { service: 'SAT', at: range(25 * 60, 27 * 60 + 40, 20) };
  it('a peak-only route (5:00 to 8:40, nothing from 9 AM) takes over', async () => {
    expect(await nightVerdict(await feed(endsAt340, [{ service: 'SUN', from: 5 * 60, to: 8 * 60 + 40 }]), 'N::0::Saturday')).toBe('pass');
  });
  it("another night route's tail (2:00 to 5:40, nothing from 9 AM) does not", async () => {
    expect(await nightVerdict(await feed(endsAt340, [{ service: 'SUN', from: 2 * 60, to: 5 * 60 + 40 }]), 'N::0::Saturday')).toBe('fail');
  });
});
