import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';

// #740: one drawn line per destination. A thin result (no departures 09:00-19:00 and fewer than
// 4 departures) never holds the line against a sibling with daytime service; everything else keeps
// the better-headway rule.

const FIXTURES = resolve(__dirname, 'fixtures');

async function fixtureZip(name: string): Promise<Buffer> {
  const zip = new JSZip();
  const dir = resolve(FIXTURES, name);
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;

/** One route, one headsign, two shapes on different roads; each shape's trips start at `starts`. */
async function twoShapeFeed(a: number[], b: number[]): Promise<Buffer> {
  const zip = new JSZip();
  const csv = (rows: string[][]) => rows.map(r => r.join(',')).join('\n') + '\n';
  zip.file('agency.txt', csv([['agency_id', 'agency_name', 'agency_url', 'agency_timezone'], ['a', 'A', 'https://example.com', 'America/Toronto']]));
  zip.file('routes.txt', csv([['route_id', 'agency_id', 'route_short_name', 'route_type'], ['r', 'a', '7', '3']]));
  zip.file('calendar.txt', csv([['service_id', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'start_date', 'end_date'], ['wk', '1', '1', '1', '1', '1', '0', '0', '20260101', '20271231']]));
  // Shape A runs north along x = 0; shape B along x = 0.01, both to the same terminal.
  const stops = [['s0', 43.70, -79.40], ['s1', 43.71, -79.40], ['s2', 43.72, -79.40], ['t1', 43.71, -79.39], ['end', 43.73, -79.40]];
  zip.file('stops.txt', csv([['stop_id', 'stop_name', 'stop_lat', 'stop_lon'], ...stops.map(([id, lat, lon]) => [String(id), String(id), String(lat), String(lon)])]));
  const shapeRows = [['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence']];
  [['A', ['s0', 's1', 's2', 'end']], ['B', ['s0', 't1', 'end']]].forEach(([id, seq]) => (seq as string[]).forEach((s, i) => {
    const stop = stops.find(x => x[0] === s)!;
    shapeRows.push([id as string, String(stop[1]), String(stop[2]), String(i + 1)]);
  }));
  zip.file('shapes.txt', csv(shapeRows));
  const trips = [['route_id', 'service_id', 'trip_id', 'trip_headsign', 'direction_id', 'shape_id']];
  const times = [['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence']];
  ([['A', a, ['s0', 's1', 's2', 'end']], ['B', b, ['s0', 't1', 'end']]] as const).forEach(([shape, starts, seq]) => starts.forEach((start, n) => {
    const id = `${shape}${n}`;
    trips.push(['r', 'wk', id, 'Terminal', '0', shape]);
    seq.forEach((s, i) => times.push([id, hm(start + i * 5), hm(start + i * 5), s, String(i + 1)]));
  }));
  zip.file('trips.txt', csv(trips));
  zip.file('stop_times.txt', csv(times));
  return zip.generateAsync({ type: 'nodebuffer' });
}

const every = (from: number, to: number, step: number) => { const out: number[] = []; for (let t = from; t <= to; t += step) out.push(t); return out; };

async function weekdayLines(buf: Buffer, slug: string) {
  const result = await processGtfsBuffer(buf, undefined, { slug });
  return JSON.parse(result.geojson).features.filter((f: any) => f.geometry.type === 'LineString' && f.properties.day === 'Weekday' && f.properties.stopId == null);
}
/** Which synthetic shape a drawn line follows: B is the only one through x = -79.39. */
const shapeOf = (f: any) => (f.geometry.coordinates.some(([lon]: number[]) => lon === -79.39) ? 'B' : 'A');

describe('drawn line per destination: daytime service wins a headway tie (#740)', () => {
  it('ttc 100 via Linkwood draws the 31-trip peak shape, not the 3 pre-06:30 trips', async () => {
    // Hand count: shape 1121839 runs 3 trips (Pape 05:51, 06:06, 06:21), median 15, no midday.
    // Shape 1121841 runs 31 trips, 06:42-10:00 every 15 then 14:54-19:34 every 18; 9-15h median 15.
    const lines = (await weekdayLines(await fixtureZip('ttc-100-linkwood'), 'ttc')).filter((f: any) => f.properties.directionId === 0);
    expect(lines).toHaveLength(1);
    const p = lines[0].properties;
    expect(p.headway).toBe(15);
    expect(p.headwayByPeriod.amPeak).not.toBeNull();
    expect(p.headwayByPeriod.pmPeak).not.toBeNull();
    expect(p.stopOrder?.length ?? 0).toBeGreaterThan(0);
  });

  it('3 early trips lose the drawn line to all-day service even with a better headway', async () => {
    const lines = await weekdayLines(await twoShapeFeed([330, 340, 350], every(420, 1320, 15)), 'synthetic');
    expect(lines.map(shapeOf)).toEqual(['B']);
  });

  it('an early burst of 4+ departures still wins on a better headway, as before', async () => {
    // A: 4 early trips every 10 (no daytime, but not thin). B: all day every 15. A scores 10.
    const lines = await weekdayLines(await twoShapeFeed([330, 340, 350, 360], every(420, 1320, 15)), 'synthetic');
    expect(lines.map(shapeOf)).toEqual(['A']);
  });

  it('a tie between two all-day shapes keeps the first result, as before', async () => {
    const both = every(420, 1320, 15);
    const lines = await weekdayLines(await twoShapeFeed(both, both.map(t => t + 7)), 'synthetic');
    expect(lines).toHaveLength(1);
    expect(shapeOf(lines[0])).toBe('A');
  });
});

describe('a thin result only loses the line to a real daytime sample (#740, capmetro per-trip shapes)', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-11T12:00:00') });
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('capmetro 335, 392 and 243 keep the pooled headline of their drawn block', async () => {
    // Real CapMetro fresh feed (20270109): routes 335 (both directions), 392 WB and 243 EB,
    // shapes thinned. The feed gives every 3-5 trip block its own shape, so every block is
    // thin-sized. Hand count: 335 Exposition WB Sunday runs every 30 from 06:00 to 22:00
    // (12 blocks of 3), 392 Kramer Station WB Sunday every 30 from 06:25 to 21:55, 243 Tech
    // Ridge EB weekday every 35 from 04:55 to 22:30 on 4-5 trip blocks. Letting a daytime
    // block of 3-5 trips take the line read its own few trips (31 -> tier 60, 70 -> infrequent).
    const result = await processGtfsBuffer(await fixtureZip('capmetro-335-392-243'), undefined, { slug: 'capmetro' });
    const lines = JSON.parse(result.geojson).features.map((f: any) => f.properties).filter((p: any) => p.stopId == null);
    const find = (route: string, dir: number, day: string, headsign: string) =>
      lines.find((p: any) => p.routeId === route && p.directionId === dir && p.day === day && p.headsign === headsign);
    expect(find('335', 0, 'Sunday', 'Exposition WB')).toMatchObject({ headway: 30, tier: '30' });
    expect(find('392', 1, 'Sunday', 'Kramer Station WB')).toMatchObject({ headway: 30, tier: '30' });
    expect(find('243', 1, 'Weekday', 'Tech Ridge Park & Ride EB')).toMatchObject({ headway: 35, tier: '60' });
  });

  it('a 3-trip early piece does not lose the line to a daytime sibling of fewer than 8 departures', async () => {
    // A: 3 early trips every 10 (thin). B: 5 daytime trips every 90 (a real but small sample).
    // B is not a sample the rule trusts, so the better-headway rule keeps A, as before.
    const lines = await weekdayLines(await twoShapeFeed([330, 340, 350], every(600, 960, 90)), 'synthetic');
    expect(lines.map(shapeOf)).toEqual(['A']);
  });
});
