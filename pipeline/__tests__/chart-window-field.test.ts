import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { processGtfsBuffer } from '../process-core';
import { edgeWaitBit, PUBLIC_TIER_MAXES } from '../../shared/rules/frequency';
import { CHART_WINDOWS } from '../tripSets';

// CIV-2013: each weekday row carries its route's reading over the chart windows (rule 9's 07:00-19:00 and the weekday
// grading window), read exactly as a period: the filter value, the trunk value and CIV-238's first- and last-wait mask.

const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
const every = (from: number, to: number, step: number) => { const out: number[] = []; for (let t = from; t <= to; t += step) out.push(t); return out; };

async function feed(starts: number[]): Promise<Buffer> {
  const zip = new JSZip();
  const csv = (rows: string[][]) => rows.map(r => r.join(',')).join('\n') + '\n';
  zip.file('agency.txt', csv([['agency_id', 'agency_name', 'agency_url', 'agency_timezone'], ['a', 'A', 'https://example.com', 'America/Toronto']]));
  zip.file('routes.txt', csv([['route_id', 'agency_id', 'route_short_name', 'route_type'], ['r', 'a', '7', '3']]));
  zip.file('calendar.txt', csv([['service_id', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'start_date', 'end_date'],
    ['wk', '1', '1', '1', '1', '1', '1', '0', '20260101', '20271231']]));
  const stops = Array.from({ length: 6 }, (_, i) => [`s${i}`, 43.70 + i * 0.01, -79.40] as const);
  zip.file('stops.txt', csv([['stop_id', 'stop_name', 'stop_lat', 'stop_lon'], ...stops.map(([id, lat, lon]) => [id, id, String(lat), String(lon)])]));
  zip.file('shapes.txt', csv([['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence'], ...stops.map(([, lat, lon], i) => ['A', String(lat), String(lon), String(i + 1)])]));
  const trips = [['route_id', 'service_id', 'trip_id', 'trip_headsign', 'direction_id', 'shape_id']];
  const times = [['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence']];
  starts.forEach((start, n) => {
    trips.push(['r', 'wk', `t${n}`, 'Terminal', '0', 'A']);
    stops.forEach(([s], i) => times.push([`t${n}`, hm(start + i * 3), hm(start + i * 3), s, String(i + 1)]));
  });
  zip.file('trips.txt', csv(trips));
  zip.file('stop_times.txt', csv(times));
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function rows(starts: number[]) {
  const result = await processGtfsBuffer(await feed(starts), undefined, { slug: 'synthetic' });
  return JSON.parse(result.geojson).features.map((f: any) => f.properties).filter((p: any) => p.stopId == null);
}

const [frequent, grading] = CHART_WINDOWS;

describe('chart window readings (CIV-2013)', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-11T12:00:00') }); });
  afterAll(() => { vi.useRealTimers(); });

  it('a route every 10 across both windows reads 10 in each, with no edge mask; only weekday rows carry it', async () => {
    const all = await rows(every(frequent.start - 30, grading.end + 30, 10));
    const weekday = all.find((p: any) => p.day === 'Weekday');
    expect(weekday.routeChartWindowHeadway).toEqual({ [frequent.key]: 10, [grading.key]: 10 });
    expect(weekday.routeChartWindowTrunkHeadway).toEqual({ [frequent.key]: 10, [grading.key]: 10 });
    expect(weekday.routeChartWindowEdgeWaitFail).toEqual({ [frequent.key]: 0, [grading.key]: 0 });
    for (const p of all.filter((p: any) => p.day !== 'Weekday')) expect(p.routeChartWindowHeadway).toBeUndefined();
  });

  it('a route that starts 40 minutes into the windows fails every grade under 60 there (CIV-238), and one that stops at the frequent window\'s end has no grading-window pass', async () => {
    const late = (await rows(every(frequent.start + 40, grading.end + 30, 10))).find((p: any) => p.day === 'Weekday');
    const mask = late.routeChartWindowEdgeWaitFail[frequent.key];
    for (const grade of PUBLIC_TIER_MAXES) expect(Boolean(mask & edgeWaitBit(grade)!), String(grade)).toBe(grade < 60);
    const early = (await rows(every(frequent.start - 30, frequent.end, 10))).find((p: any) => p.day === 'Weekday');
    expect(early.routeChartWindowHeadway[frequent.key]).toBe(10);
    const breaks = early.routeChartWindowEdgeWaitFail[grading.key];
    for (const grade of PUBLIC_TIER_MAXES) expect(Boolean(breaks & edgeWaitBit(grade)!), String(grade)).toBe(true);
  });
});
