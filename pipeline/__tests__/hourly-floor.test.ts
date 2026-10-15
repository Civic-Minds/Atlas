import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';

// The route card's hourly chart reads the destination pool; its rows are floored at the worst
// drawn stop some pooled trips skip (#771). The chart takes the same floor, so a planner never
// sees "every 8" bars under a row that says 16.
async function fixtureZip(name: string): Promise<Buffer> {
  const dir = resolve(__dirname, 'fixtures', name);
  const zip = new JSZip();
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
async function synth(): Promise<Buffer> {
  const zip = new JSZip();
  const csv = (rows: string[][]) => rows.map(r => r.join(',')).join('\n') + '\n';
  zip.file('agency.txt', csv([['agency_id', 'agency_name', 'agency_url', 'agency_timezone'], ['a', 'A', 'https://example.com', 'America/Toronto']]));
  zip.file('routes.txt', csv([['route_id', 'agency_id', 'route_short_name', 'route_type'], ['r', 'a', '7', '3']]));
  zip.file('calendar.txt', csv([['service_id', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'start_date', 'end_date'], ['wk', '1', '1', '1', '1', '1', '0', '0', '20260101', '20271231']]));
  const stops = Array.from({ length: 9 }, (_, i) => [`s${i}`, 43.70 + i * 0.01, -79.40] as const);
  zip.file('stops.txt', csv([['stop_id', 'stop_name', 'stop_lat', 'stop_lon'], ...stops.map(([id, lat, lon]) => [id, id, String(lat), String(lon)])]));
  const seqA = stops.map(s => s[0]); const seqB = seqA.filter(s => s !== 's4');
  const shapeRows = [['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence']];
  for (const [id, seq] of [['A', seqA], ['B', seqB]] as const) seq.forEach((s, i) => { const st = stops.find(x => x[0] === s)!; shapeRows.push([id, String(st[1]), String(st[2]), String(i + 1)]); });
  zip.file('shapes.txt', csv(shapeRows));
  const trips = [['route_id', 'service_id', 'trip_id', 'trip_headsign', 'direction_id', 'shape_id']];
  const times = [['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence']];
  const add = (shape: string, starts: number[], seq: readonly string[]) => starts.forEach((start, n) => {
    const id = `${shape}${n}`; trips.push(['r', 'wk', id, 'Terminal', '0', shape]);
    seq.forEach((s, i) => times.push([id, hm(start + i * 2), hm(start + i * 2), s, String(i + 1)]));
  });
  // A every 30 from 06:00 to 22:00 except no departure 12:00-12:59 (hour 12 unserved at s4); B every 30 offset by 15, all day.
  const a = []; for (let t = 360; t <= 1320; t += 30) if (t < 720 || t >= 780) a.push(t);
  const b = []; for (let t = 375; t <= 1320; t += 30) b.push(t);
  add('A', a, seqA); add('B', b, seqB);
  zip.file('trips.txt', csv(trips)); zip.file('stop_times.txt', csv(times));
  return zip.generateAsync({ type: 'nodebuffer' });
}

const GAPS_35: Record<number, number> = { 9: 61, 10: 61, 11: 61, 12: 61, 13: 61, 14: 61, 15: 61 };

describe('hourly chart floored like the period values', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-14T12:00:00') }); });
  afterAll(() => { vi.useRealTimers(); });

  it("TTC 29 northbound: the row's hours read its worst drawn stop's 16, not the pooled trunk's 8", async () => {
    const result = await processGtfsBuffer(await fixtureZip('ttc-29-weekday'), undefined, { slug: 'ttc' });
    const north = JSON.parse(result.geojson).features.map((f: any) => f.properties)
      .filter((p: any) => p.stopId == null && p.day === 'Weekday' && p.routeId === '29' && p.directionId === 1);
    // One "Wilson" row: the Dufferin Gate and Princes' Gates origins pool at the trunk (8) and
    // the row is floored at its own-only stops (16, #771).
    expect(north).toHaveLength(1);
    for (const row of north) {
      expect(row.headway).toBe(16);
      expect(row.headwayByPeriod.midday).toBe(16);
      // Each hour takes the same floor (16 through the midday, 14 in the 14:00 hour where the
      // own stops run more often), never the trunk's 8, and the hour's longest gap is the floor
      // stop's, not the trunk's.
      for (const h of [10, 11, 12, 13]) { expect(row.headwayByHour[h], `hour ${h}`).toBe(16); expect(row.maxGapByHour[h], `gap ${h}`).toBe(16); }
      expect(row.headwayByHour[14]).toBe(14);
      expect(row.maxGapByHour[14]).toBe(19);
      // The trunk's every 8 still shows at the shared stops.
      const trunk = row.stopOrder.slice(-20).map((s: string) => row.stopHeadways[s]);
      expect(trunk.every((v: number) => v === 8)).toBe(true);
    }
  });

  it('TriMet 35 to Oregon City: a mid-route deviation served hourly by one shape still floors the line (not a stub)', async () => {
    const result = await processGtfsBuffer(await fixtureZip('trimet-35-weekday'), undefined, { slug: 'trimet' });
    const oc = JSON.parse(result.geojson).features.map((f: any) => f.properties)
      .find((p: any) => p.stopId == null && p.day === 'Weekday' && p.routeId === '35' && p.directionId === 0 && p.headsign === 'Oregon City Transit Center');
    expect(oc.headway).toBe(60);
    expect(oc.headwayByPeriod.midday).toBe(60);
    // The deviation stops run hourly, so no hour window of theirs has three departures and
    // their period value stands in: 60 through the midday, 62 in the AM peak.
    for (const h of [9, 10, 11, 12, 13, 14, 15]) expect(oc.headwayByHour[h], `hour ${h}`).toBe(60);
    // A stand-in hour's gap is never under the value it stands in for: the larger of the clock
    // hour's gap and the period's.
    for (const h of [9, 10, 11, 12, 13, 14, 15]) expect(oc.maxGapByHour[h], `gap ${h}`).toBe(GAPS_35[h]);
    for (const h of [7, 8]) expect(oc.headwayByHour[h], `hour ${h}`).toBe(62);
  });

  it('a stand-in only fills hours the floor stop really serves', async () => {
    // A (drawn) every 30 at nine stops, B every 30 offset by 15 at all but s4. s4 is the floor
    // stop: every hour reads 30 and its own 30-minute gap, not the pool's 15. A has no
    // departure between 12:00 and 13:00, so hour 12 keeps the pool's reading (B alone, 17)
    // instead of the stand-in 30, and hour 11 carries s4's real 90-minute gap.
    const result = await processGtfsBuffer(await synth(), undefined, { slug: 'synthetic' });
    const line = JSON.parse(result.geojson).features.map((f: any) => f.properties).find((p: any) => p.stopId == null && p.day === 'Weekday');
    expect(line.stopHeadways.s4).toBe(30);
    for (const h of [8, 9, 10, 13, 14, 15]) { expect(line.headwayByHour[h], `hour ${h}`).toBe(30); expect(line.maxGapByHour[h], `gap ${h}`).toBe(30); }
    expect(line.headwayByHour[11]).toBe(30);
    expect(line.maxGapByHour[11]).toBe(90);
    expect(line.headwayByHour[12]).toBe(17);
  });
});
