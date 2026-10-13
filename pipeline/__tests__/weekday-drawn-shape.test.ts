import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { processGtfsBuffer } from '../process-core';

// #716: two patterns of one route direction and headsign compete for one Weekday map line.
// The more frequent pattern used to win even when it only runs on a weekday that is not the
// route's typical one (cata-state-college VE Campus: a Friday-only shape beat the Mon-Thu
// shape), so the drawn line and the stop data described different service.

function hm(mins: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}:00`;
}

type Pattern = { service: string; days: string; shape: 'shA' | 'shB'; every: number };

// One route, one direction and headsign, two shape ids with the same geometry (as in the
// cata-state-college feed, where Mon-Thu and Friday each have their own copy of the path).
async function feed(patterns: Pattern[]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('agency.txt', 'agency_id,agency_name,agency_url,agency_timezone\na,Shape Transit,https://example.test,America/Toronto\n');
  zip.file('routes.txt', 'route_id,route_short_name,route_long_name,route_type\nr1,1,Main Street,3\n');
  zip.file('stops.txt', 'stop_id,stop_name,stop_lat,stop_lon\ns1,First,43.65,-79.38\ns2,Middle,43.655,-79.375\ns3,Last,43.66,-79.37\n');
  zip.file('shapes.txt', [
    'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence',
    'shA,43.65,-79.38,1', 'shA,43.655,-79.375,2', 'shA,43.66,-79.37,3',
    'shB,43.65,-79.38,1', 'shB,43.655,-79.375,2', 'shB,43.66,-79.37,3',
  ].join('\n') + '\n');
  zip.file('calendar.txt', [
    'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date',
    ...patterns.map(p => `${p.service},${p.days.split('').join(',')},20260107,20261220`),
  ].join('\n') + '\n');
  const trips = ['route_id,service_id,trip_id,trip_headsign,direction_id,shape_id'];
  const stopTimes = ['trip_id,arrival_time,departure_time,stop_id,stop_sequence'];
  for (const p of patterns) {
    for (let start = 6 * 60; start <= 22 * 60; start += p.every) {
      const id = `${p.service}-${start}`;
      trips.push(`r1,${p.service},${id},Downtown,0,${p.shape}`);
      stopTimes.push(
        `${id},${hm(start)},${hm(start)},s1,1`,
        `${id},${hm(start + 5)},${hm(start + 5)},s2,2`,
        `${id},${hm(start + 10)},${hm(start + 10)},s3,3`,
      );
    }
  }
  zip.file('trips.txt', trips.join('\n') + '\n');
  zip.file('stop_times.txt', stopTimes.join('\n') + '\n');
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function weekdayLines(buf: Buffer): Promise<{ headway: number | null; stopHeadways: Record<string, number> }[]> {
  const result = await processGtfsBuffer(buf, undefined, { slug: 'drawn-shape' });
  return JSON.parse(result.geojson).features
    .filter((f: any) => f.properties.stopId == null && f.properties.day === 'Weekday')
    .map((f: any) => ({ headway: f.properties.headway, stopHeadways: f.properties.stopHeadways ?? {} }));
}

describe('Weekday drawn shape comes from a pattern that runs on the representative weekday (#716)', () => {
  it('draws the Mon-Thu pattern, not the more frequent Friday-only one', async () => {
    const lines = await weekdayLines(await feed([
      { service: 'monthu', days: '1111000', shape: 'shA', every: 30 },
      { service: 'fri', days: '0000100', shape: 'shB', every: 15 },
    ]));
    expect(lines).toHaveLength(1);
    // The line carries the Mon-Thu service (every 30), not the Friday-only one (every 15).
    expect(lines[0].headway).toBe(30);
    for (const headway of Object.values(lines[0].stopHeadways)) expect(headway).toBe(30);
  });

  it('still draws the more frequent pattern when both run on the representative weekday', async () => {
    const lines = await weekdayLines(await feed([
      { service: 'all30', days: '1111100', shape: 'shA', every: 30 },
      { service: 'all15', days: '1111100', shape: 'shB', every: 15 },
    ]));
    expect(lines).toHaveLength(1);
    expect(lines[0].headway).toBeLessThanOrEqual(15);
  });

  it('a single pattern is unaffected', async () => {
    const lines = await weekdayLines(await feed([
      { service: 'weekdays', days: '1111100', shape: 'shA', every: 20 },
    ]));
    expect(lines).toHaveLength(1);
    expect(lines[0].headway).toBe(20);
  });
});
