import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { processGtfsBuffer } from '../process-core';
import { isNightRouteDirection, nextServiceDay, overnightWindowTimes } from '../overnightTerminal';

async function fixtureZip(name: string): Promise<Buffer> {
  const dir = resolve(__dirname, 'fixtures', name);
  const zip = new JSZip();
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

const at = (...hhmm: string[]) => hhmm.map(t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; });

describe('overnight window across a timetable change (#896)', () => {
  it('a Saturday night carries on into Sunday, and a Sunday night into the weekday timetable', () => {
    expect(nextServiceDay('Saturday')).toBe('Sunday');
    expect(nextServiceDay('Sunday')).toBe('Weekday');
    expect(nextServiceDay('Weekday')).toBeNull();
  });

  it("takes the next day's early trips in place of its own when the night runs past midnight", () => {
    // TTC 373 to Steeles at Kipling: Saturday's timetable runs to 28:23 with its own 04:24-05:28
    // trips belonging to Saturday morning; Sunday's 04:53 trip is the next bus that night.
    expect(overnightWindowTimes(at('4:24', '26:04', '28:23'), at('4:53', '5:23', '26:30')))
      .toEqual(at('26:04', '28:23', '28:53', '29:23'));
  });

  it("adds only the next day's trips after the night's last own trip", () => {
    // Saturday hourly to 29:00 and Sunday from 02:03: both together would read every 3.
    expect(overnightWindowTimes(at('26:00', '27:00', '28:00', '29:00'), at('2:03', '3:03', '4:03', '5:03')))
      .toEqual(at('26:00', '27:00', '28:00', '29:00', '29:03'));
    // A 30-minute offset would read every 30.
    expect(overnightWindowTimes(at('26:00', '27:00', '28:00'), at('2:30', '3:30', '4:30', '5:30')))
      .toEqual(at('26:00', '27:00', '28:00', '28:30', '29:30'));
  });

  it("keeps a day's own times when nothing runs past midnight or the next day has no departures here", () => {
    // A daytime route's thin early shape (ttc 35A at 05:12) is not a night carrying on.
    expect(overnightWindowTimes(at('5:12', '5:41'), at('5:30'))).toEqual(at('5:12', '5:41'));
    expect(overnightWindowTimes(at('5:12', '26:10'), undefined)).toEqual(at('5:12', '26:10'));
  });
});

describe('TTC night routes drawn on a minor pattern (#896)', () => {
  // Real TTC feed (2026-09-30 to 10-31), routes 337 Islington and 373 Royal York. Both run every
  // 30 overnight. 337 to Steeles on Saturday is drawn on a short turn with three trips at 04:42,
  // 05:05 and 05:28, and 373 to Steeles and Kipling on the pattern from stop 14753 (25:23-26:23),
  // so the overnight values came from those few trips: a 162-minute gap and a 217-minute wait.
  const overnight = async () => {
    const result = await processGtfsBuffer(await fixtureZip('ttc-337-373-night'), undefined, { slug: 'ttc' });
    return Object.fromEntries(JSON.parse(result.geojson).features
      .map((feature: any) => feature.properties)
      .filter((p: any) => p.stopId == null)
      .map((p: any) => [`${p.routeShortName} ${p.directionId} ${p.day}`, {
        headway: p.headwayByPeriod?.overnight ?? null,
        coverage: p.periodCoverageHeadway?.overnight ?? null,
        maxGap: p.maxGapByPeriod?.overnight ?? null,
        headline: p.headway ?? null,
      }]));
  };

  it('reads every 30 on Saturday and Sunday nights, both directions', async () => {
    const values = await overnight();
    // Each trip at its first stop, never better than the drawn line's best stop. To Lake Shore:
    // Saturday 26:07-28:38 every 30, then Sunday's 05:08 and 05:38; the longest wait is 31.
    expect(values['337 0 Saturday']).toEqual({ headway: 30, coverage: 31, maxGap: 31, headline: 30 });
    // To Steeles: Saturday 26:25-27:54, then Sunday's 04:24-05:46. Its headline was 23, from the
    // three-trip short turn; it is never better than the night's.
    expect(values['337 1 Saturday']).toEqual({ headway: 29, coverage: 30, maxGap: 30, headline: 29 });
    expect(values['373 0 Saturday']).toEqual({ headway: 30, coverage: 30, maxGap: 30, headline: 30 });
    expect(values['373 1 Saturday']).toEqual({ headway: 30, coverage: 30, maxGap: 30, headline: 30 });
    // Sunday night's last trip leaves at 28:33; the weekday timetable has no early 373 trip, so
    // the night ends there (87 minutes to 06:00), as riders find it.
    expect(values['373 1 Sunday']).toEqual({ headway: 30, coverage: 87, maxGap: 30, headline: 30 });
  });

  it('leaves lines that read their periods from the destination already (Step 5) unchanged', async () => {
    const values = await overnight();
    expect(values['337 1 Sunday']).toEqual({ headway: 30, coverage: 68, maxGap: 68, headline: 30 });
    expect(values['373 0 Sunday']).toEqual({ headway: 30, coverage: 57, maxGap: 57, headline: 30 });
  });
});

const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
const every = (from: number, to: number, step: number) => { const out: number[] = []; for (let t = from; t <= to; t += step) out.push(t); return out; };

/**
 * One route, one headsign 'Terminal', two branches from different first stops (a0 and b0) that
 * meet only at the terminal. `day` picks the calendar ('sat' or 'wk'); trips run `starts` minutes.
 */
async function twoBranchFeed(day: 'sat' | 'wk', a: number[], b: number[]): Promise<Buffer> {
  const zip = new JSZip();
  const csv = (rows: string[][]) => rows.map(r => r.join(',')).join('\n') + '\n';
  zip.file('agency.txt', csv([['agency_id', 'agency_name', 'agency_url', 'agency_timezone'], ['a', 'A', 'https://example.com', 'America/Toronto']]));
  zip.file('routes.txt', csv([['route_id', 'agency_id', 'route_short_name', 'route_type'], ['r', 'a', '9', '3']]));
  zip.file('calendar.txt', csv([['service_id', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'start_date', 'end_date'],
    day === 'sat' ? ['sv', '0', '0', '0', '0', '0', '1', '0', '20260101', '20271231'] : ['sv', '1', '1', '1', '1', '1', '0', '0', '20260101', '20271231']]));
  const stops: Array<[string, number, number]> = [['a0', 43.70, -79.40], ['a1', 43.71, -79.40], ['b0', 43.70, -79.38], ['b1', 43.71, -79.38], ['end', 43.73, -79.39]];
  zip.file('stops.txt', csv([['stop_id', 'stop_name', 'stop_lat', 'stop_lon'], ...stops.map(([id, lat, lon]) => [id, id, String(lat), String(lon)])]));
  const seqs: Array<[string, string[], number[]]> = [['A', ['a0', 'a1', 'end'], a], ['B', ['b0', 'b1', 'end'], b]];
  const shapeRows = [['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence']];
  for (const [id, seq] of seqs) seq.forEach((s, i) => { const st = stops.find(x => x[0] === s)!; shapeRows.push([id, String(st[1]), String(st[2]), String(i + 1)]); });
  zip.file('shapes.txt', csv(shapeRows));
  const trips = [['route_id', 'service_id', 'trip_id', 'trip_headsign', 'direction_id', 'shape_id']];
  const times = [['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence']];
  for (const [shape, seq, starts] of seqs) starts.forEach((start, n) => {
    const id = `${shape}${n}`;
    trips.push(['r', 'sv', id, 'Terminal', '0', shape]);
    seq.forEach((s, i) => times.push([id, hm(start + i * 10), hm(start + i * 10), s, String(i + 1)]));
  });
  zip.file('trips.txt', csv(trips));
  zip.file('stop_times.txt', csv(times));
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function lineFor(buf: Buffer, day: string) {
  const result = await processGtfsBuffer(buf, undefined, { slug: 'synthetic' });
  return JSON.parse(result.geojson).features
    .filter((f: any) => f.geometry.type === 'LineString' && f.properties.stopId == null && f.properties.day === day)
    .map((f: any) => f.properties);
}

describe('#896 review: one stop\'s service, real night service only', () => {
  it('two hourly night branches from different first stops never read as every 30', async () => {
    // A leaves a0 on the hour 01:00-04:00 (25:00-28:00), B leaves b0 on the half hour.
    const lines = await lineFor(await twoBranchFeed('sat', every(1500, 1680, 60), every(1530, 1710, 60)), 'Saturday');
    expect(lines.length).toBeGreaterThan(0);
    // Each branch's own stops see a bus every 60.
    for (const p of lines) expect(p.headwayByPeriod.overnight).toBe(60);
  });

  it('a drawn branch with two overnight trips beside a sister every 15 never reads every 15', async () => {
    // Sister A leaves a0 every 15 from 01:00 to 04:45; B leaves b0 only at 02:10 and 03:10.
    const lines = await lineFor(await twoBranchFeed('sat', every(1500, 1725, 15), [1570, 1630]), 'Saturday');
    for (const p of lines) {
      const ovn = p.headwayByPeriod?.overnight;
      // Whatever line is drawn, no value is better than its own stops get; B's stops get two
      // trips, which read no headway at all.
      if (ovn != null) expect(ovn === 15 ? p.periodCoverageHeadway.overnight : ovn).toBeGreaterThanOrEqual(15);
    }
  });

  it('a morning-only route starting at 03:45 is not a night route', () => {
    expect(isNightRouteDirection([at('3:45', '4:00', '4:15', '5:45')])).toBe(false);
    expect(isNightRouteDirection([at('23:30', '1:00', '2:00')])).toBe(true);
    expect(isNightRouteDirection([at('26:00', '27:00')])).toBe(true);
    // Any daytime departure makes it a daytime route.
    expect(isNightRouteDirection([at('26:00'), at('12:00')])).toBe(false);
  });

  it('a morning-rush-only route (04:30-08:30) is not a night route: its headline is not floored', async () => {
    const lines = await lineFor(await twoBranchFeed('wk', every(270, 510, 15), []), 'Weekday');
    // Every 15 from 04:30: whatever the line reads, the overnight floor never raises it.
    expect(lines.length).toBeGreaterThan(0);
    for (const p of lines) expect(p.headway == null || p.headway <= 15).toBe(true);
  });

  it('a Weekday night keeps its own early trips (no next-day timetable)', () => {
    expect(nextServiceDay('Weekday')).toBeNull();
    expect(overnightWindowTimes(at('26:00', '5:00'), undefined)).toEqual(at('26:00', '5:00'));
  });
});

describe('#896 review: lines outside the rule keep their values', () => {
  const props = async (fixture: string, slug: string) => {
    const result = await processGtfsBuffer(await fixtureZip(fixture), undefined, { slug });
    return JSON.parse(result.geojson).features.map((f: any) => f.properties).filter((p: any) => p.stopId == null);
  };

  it('a daytime route\'s thin evening shape keeps its own overnight values (AC Transit 211 to Fremont BART)', async () => {
    // Real feed, weekday: the drawn "Fremont BART" line is an evening-only pattern of an all-day
    // route; the values are those origin/main publishes.
    const p = (await props('actransit-211', 'actransit')).find((x: any) => x.day === 'Weekday' && x.directionId === 0 && x.headsign === 'Fremont BART');
    expect(p.periodCoverageHeadway.overnight).toBe(176);
    expect(p.maxGapByPeriod.overnight).toBe(176);
    expect(p.headway).toBe(30);
  });

  it('Marin 30 on Saturday keeps its every-30 headline: it runs every 30 until 02:00', async () => {
    const sat = (await props('marin-30', 'marintransit')).filter((x: any) => x.day === 'Saturday');
    expect(sat.length).toBe(2);
    for (const p of sat) {
      expect(p.headway).toBe(30);
      expect(p.headwayByPeriod.evening).toBe(30);
    }
  });
});
