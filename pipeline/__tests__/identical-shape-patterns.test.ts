import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';

// #1446: Fresno's 11.2.26 feed writes Route 39 toward the airport under two shape ids, 22539 and
// 22524, with the same points and the same stops, its weekday trips alternating between them every
// 15 minutes. Each id read every 30, and so did the direction's headline.

const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
const csv = (rows: string[][]) => rows.map(r => r.join(',')).join('\n') + '\n';

type SecondShape = 'none' | 'identical' | 'deviation';

const mins = (list: string) => list.split(' ').map(t => Number(t.split(':')[0]) * 60 + Number(t.split(':')[1]));
// First-stop departures of the feed's weekday trips toward the airport, by shape id.
const SHAPE_22539 = mins('5:41 6:02 6:18 6:42 7:02 7:32 8:04 8:34 9:04 9:34 10:04 10:34 11:04 11:34 12:04 12:34 13:04 13:34 14:04 14:34 15:04 15:34 16:04 16:34 17:04 17:34 18:34 19:34 21:14');
const SHAPE_22524 = mins('7:12 7:47 8:19 8:49 9:19 9:49 10:19 10:49 11:19 11:49 12:19 12:49 13:19 13:49 14:19 14:49 15:19 15:49 16:19 16:49 17:19 17:49 18:04 19:04 20:04');

/**
 * Route 39: direction 1 at the feed's own 54 weekday departures (every 15 by day), with no
 * trip_headsign, as Fresno writes it; direction 0 every 15 on one shape. `second` puts the 29 trips
 * the feed writes under 22539 on that second shape id: the same points, or a path that leaves the
 * line between two stops and comes back.
 * Route 41 is a plain every-30 route on one shape.
 */
async function feed(second: SecondShape): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('agency.txt', csv([['agency_id', 'agency_name', 'agency_url', 'agency_timezone'], ['a', 'A', 'https://example.com', 'America/Los_Angeles']]));
  zip.file('routes.txt', csv([['route_id', 'agency_id', 'route_short_name', 'route_type'], ['39', 'a', '39', '3'], ['41', 'a', '41', '3']]));
  zip.file('calendar.txt', csv([['service_id', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'start_date', 'end_date'],
    ['wk', '1', '1', '1', '1', '1', '0', '0', '20260101', '20271231']]));
  const n = 8;
  const out = Array.from({ length: n }, (_, i) => `o${i}`);
  const back = Array.from({ length: n }, (_, i) => `b${i}`);
  const other = Array.from({ length: n }, (_, i) => `x${i}`);
  zip.file('stops.txt', csv([['stop_id', 'stop_name', 'stop_lat', 'stop_lon'],
    ...out.map((id, i) => [id, `Out ${i}`, String(36.7 + i * 0.01), '-119.78']),
    ...back.map((id, i) => [id, `Back ${i}`, String(36.7 + (n - 1 - i) * 0.01), '-119.7801']),
    ...other.map((id, i) => [id, `Other ${i}`, '36.6', String(-119.7 + i * 0.01)])]));
  const shapeRows = (id: string, points: [number, number][]) => points.map(([lat, lon], i) => [id, String(lat), String(lon), String(i + 1)]);
  const backLine = back.map((_, i): [number, number] => [36.7 + (n - 1 - i) * 0.01, -119.7801]);
  // Leaves the line between the fourth and fifth stop for a street 900 m east, then returns.
  const deviation: [number, number][] = [...backLine.slice(0, 4), [backLine[3][0] - 0.002, -119.77], [backLine[4][0] + 0.002, -119.77], ...backLine.slice(4)];
  zip.file('shapes.txt', csv([['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence'],
    ...shapeRows('22523', out.map((_, i): [number, number] => [36.7 + i * 0.01, -119.78])),
    ...shapeRows('22524', backLine),
    ...(second === 'none' ? [] : shapeRows('22539', second === 'identical' ? backLine : deviation)),
    ...shapeRows('41', other.map((_, i): [number, number] => [36.6, -119.7 + i * 0.01]))]));
  const trips = [['route_id', 'service_id', 'trip_id', 'trip_headsign', 'direction_id', 'shape_id']];
  const times = [['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence']];
  const run = (tripId: string, stops: string[], start: number) => stops.forEach((s, i) => times.push([tripId, hm(start + i * 4), hm(start + i * 4), s, String(i + 1)]));
  for (let i = 0; i < 54; i++) {
    trips.push(['39', 'wk', `out${i}`, '', '0', '22523']);
    run(`out${i}`, out, 365 + i * 15);
  }
  SHAPE_22539.forEach((start, i) => {
    trips.push(['39', 'wk', `a${i}`, '', '1', second === 'none' ? '22524' : '22539']);
    run(`a${i}`, back, start);
  });
  SHAPE_22524.forEach((start, i) => {
    trips.push(['39', 'wk', `b${i}`, '', '1', '22524']);
    run(`b${i}`, back, start);
  });
  for (let i = 0; i < 27; i++) {
    trips.push(['41', 'wk', `x${i}`, 'Other 7', '0', '41']);
    run(`x${i}`, other, 360 + i * 30);
  }
  zip.file('trips.txt', csv(trips));
  zip.file('stop_times.txt', csv(times));
  return zip.generateAsync({ type: 'nodebuffer' });
}

type Row = Record<string, any>;
async function weekdayRows(second: SecondShape): Promise<{ rows: Row[]; status: string[] }> {
  const status: string[] = [];
  const result = await processGtfsBuffer(await feed(second), message => status.push(message), { slug: 'synthetic', mergeIdenticalShapeIds: true });
  const rows = JSON.parse(result.geojson).features
    .filter((f: any) => f.properties.day === 'Weekday' && f.properties.stopId == null)
    .map((f: any) => ({ ...f.properties, points: f.geometry.coordinates.length }));
  return { rows, status };
}
const pick = (rows: Row[], route: string, dir: number) => rows.filter(r => r.routeShortName === route && r.directionId === dir);
// What a rider reads: the headline, the tier and the period values, not the internal ids.
const reads = (row: Row) => ({ headway: row.headway, tier: row.tier, serviceClass: row.serviceClass, headwayByPeriod: row.headwayByPeriod, directionFilterHeadwayByPeriod: row.directionFilterHeadwayByPeriod, routeAllDayHeadway: row.routeAllDayHeadway, points: row.points });

describe('one line written under two identical shape ids (#1446)', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-11T12:00:00') }); });
  afterAll(() => { vi.useRealTimers(); });

  it('Fresno 39: trips alternating between two identical shapes read every 15, as on one shape', async () => {
    const { rows, status } = await weekdayRows('identical');
    const plain = await weekdayRows('none');
    const toAirport = pick(rows, '39', 1);
    expect(toAirport).toHaveLength(1);
    expect(toAirport[0].headway).toBe(15);
    // The tier grades every gap, late evening included (20:04 to 21:14), so it is not '15'; it is
    // what one shape id reads (below), and better than the 'infrequent' two ids read.
    expect(toAirport[0].tier).toBe('60');
    expect(toAirport[0].headwayByPeriod).toMatchObject({ amPeak: 17, midday: 15, pmPeak: 15 });
    // Exactly what the same timetable reads when the feed uses one shape id.
    expect(toAirport[0]).toEqual(pick(plain.rows, '39', 1)[0]);
    expect(status.some(line => line.includes('Identical shapes: 25 trips of 1 pattern'))).toBe(true);
    expect(plain.status.some(line => line.includes('Identical shapes'))).toBe(false);
  });

  it('the other direction and another route read the same with or without the second shape id', async () => {
    const { rows } = await weekdayRows('identical');
    const plain = await weekdayRows('none');
    expect(pick(rows, '39', 0)).toEqual(pick(plain.rows, '39', 0));
    expect(pick(rows, '39', 0)[0].headway).toBe(15);
    expect(pick(rows, '41', 0)).toEqual(pick(plain.rows, '41', 0));
    expect(pick(rows, '41', 0)[0].headway).toBe(30);
  });

  it('the same stops on a path that leaves the line between two stops stay two patterns, as before', async () => {
    const { rows, status } = await weekdayRows('deviation');
    expect(status.some(line => line.includes('Identical shapes'))).toBe(false);
    const toAirport = pick(rows, '39', 1);
    expect(toAirport).toHaveLength(1);
    // Pinned to what main reads for this feed today (two patterns every 30 under one headsign).
    expect(reads(toAirport[0])).toMatchInlineSnapshot(`
      {
        "directionFilterHeadwayByPeriod": {
          "amPeak": 16,
          "evening": 90,
          "late": null,
          "midday": 15,
          "overnight": null,
          "pmPeak": 30,
        },
        "headway": 30,
        "headwayByPeriod": {
          "amPeak": 17,
          "evening": 30,
          "late": null,
          "midday": 15,
          "overnight": null,
          "pmPeak": 15,
        },
        "points": 6,
        "routeAllDayHeadway": 15,
        "serviceClass": "regular",
        "tier": "infrequent",
      }
    `);
  });
});
