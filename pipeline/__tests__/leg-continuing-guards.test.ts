import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { processGtfsBuffer } from '../process-core';

/**
 * CIV-1723 (#1550): a slot drawn by two legs (one ends where the other starts) is drawn by the
 * leg that goes on only when another pattern runs the whole first leg, the next leg ends at a stop
 * no other pattern ends at, and the next leg is not a loop.
 */
const STOPS: Record<string, [number, number]> = {
  A: [43.60, -79.40], B: [43.61, -79.40], J: [43.62, -79.40], K: [43.63, -79.40], L: [43.64, -79.40], M: [43.62, -79.38],
};
const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;

/** Pattern X runs hourly as two legs A-B-J then the given second leg; pattern Y runs the given stops every 10. */
async function feed(secondLeg: string[], other: string[]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('agency.txt', 'agency_id,agency_name,agency_url,agency_timezone\na,Fixture Transit,https://example.test,America/Toronto\n');
  zip.file('routes.txt', 'route_id,route_short_name,route_long_name,route_type\nr1,9,Nine,3\n');
  zip.file('stops.txt', 'stop_id,stop_name,stop_lat,stop_lon\n' + Object.entries(STOPS).map(([id, [la, lo]]) => `${id},Stop ${id},${la},${lo}`).join('\n') + '\n');
  zip.file('calendar.txt', 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nwk,1,1,1,1,1,0,0,20260101,20271231\n');
  const shapes: Record<string, string[]> = { x1: ['A', 'B', 'J'], x2: secondLeg, y: other };
  zip.file('shapes.txt', 'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\n' + Object.entries(shapes).flatMap(([id, ss]) => ss.map((s, i) => `${id},${STOPS[s][0]},${STOPS[s][1]},${i + 1}`)).join('\n') + '\n');
  const trips = ['route_id,service_id,trip_id,trip_headsign,direction_id,shape_id'];
  const st = ['trip_id,arrival_time,departure_time,stop_id,stop_sequence'];
  const add = (id: string, hs: string, shape: string, start: number) => {
    trips.push(`r1,wk,${id},${hs},0,${shape}`);
    shapes[shape].forEach((s, i) => st.push(`${id},${hm(start + i * 4)},${hm(start + i * 4)},${s},${i + 1}`));
  };
  for (let t = 6 * 60; t < 20 * 60; t += 60) { add(`x1-${t}`, 'X', 'x1', t); add(`x2-${t}`, 'X', 'x2', t + 8); }
  for (let t = 6 * 60; t < 22 * 60; t += 10) add(`y-${t}`, 'Y', 'y', t);
  zip.file('trips.txt', trips.join('\n') + '\n');
  zip.file('stop_times.txt', st.join('\n') + '\n');
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function drawnEnd(secondLeg: string[], other: string[]): Promise<[number, number]> {
  const r = await processGtfsBuffer(await feed(secondLeg, other), undefined, { slug: 'fixture' });
  const row = JSON.parse(r.geojson).features.find((f: any) => f.properties?.headsign === 'X' && f.properties.day === 'Weekday' && f.properties.stopId == null);
  const c = row.geometry.coordinates;
  return c[c.length - 1];
}

describe('the leg that goes on draws the slot only where it is the route\'s own end (CIV-1723)', () => {
  it('draws the leg that goes on when another pattern runs the first leg (TTC 63B)', async () => {
    expect(await drawnEnd(['J', 'K', 'L'], ['A', 'B', 'J', 'M'])).toEqual([STOPS.L[1], STOPS.L[0]]);
  });

  it('keeps the first leg when another pattern also ends where the next leg ends (South Bend 7 at MTC)', async () => {
    expect(await drawnEnd(['J', 'K', 'L'], ['A', 'B', 'J', 'M', 'L'])).toEqual([STOPS.J[1], STOPS.J[0]]);
  });

  it('keeps the first leg when the next leg is a loop back to the junction (Cascades East 20)', async () => {
    expect(await drawnEnd(['J', 'K', 'L', 'J'], ['A', 'B', 'J', 'M'])).toEqual([STOPS.J[1], STOPS.J[0]]);
  });
});
