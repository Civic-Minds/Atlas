import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from 'vitest';
import { processGtfsBuffer } from '../process-core';
import { alignedSharedRuns, contiguousSharedRuns } from '../sharedStretch';

async function fixtureZip(name: string): Promise<Buffer> {
  const dir = resolve(__dirname, 'fixtures', name);
  const zip = new JSZip();
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function weekdayRows(fixture: string, slug: string): Promise<any[]> {
  const result = await processGtfsBuffer(await fixtureZip(fixture), undefined, { slug });
  return JSON.parse(result.geojson).features
    .map((feature: any) => feature.properties)
    .filter((p: any) => p.stopId == null && p.day === 'Weekday');
}

/** A row's published stop value in one period, stop by stop along its stopOrder (null: none). */
const periodRow = (p: any, pk: string): Array<number | null> =>
  (p.stopOrder as string[]).map(stopId => p.stopPeriodHeadways?.[stopId]?.[pk] ?? null);

/** Compact expected rows: "22x24,21x20" is 22 at 24 stops then 21 at 20 stops; "-" is no value. */
const runs = (spec: string): Array<number | null> => spec.split(',').flatMap(part => {
  const [value, count] = part.split('x');
  return Array.from({ length: Number(count ?? 1) }, () => (value === '-' ? null : Number(value)));
});

describe('a rush-hour-only bus pattern reads what serves its stops in its own rush period (CIV-850)', () => {
  // Real LA Metro bus feed (June-December 2026 timetable), route 40 direction 0, every weekday
  // trip on the Monday-Friday service (a one-weekday cut would be partial-weekday and skip
  // pooling). The PM pattern to Patsaouras Transit Plaza (11 trips, 14:57-18:23 and two late
  // trips) runs the Division 13 line's stops minus its layover. Between stops 45 and 87 the two
  // patterns alternate into a bus every 10-11 (GTFS: 21-24 departures 15:00-19:00, longest
  // gap 11-16), while Patsaouras alone is every 18-21.
  let rows: any[];
  beforeAll(async () => { rows = (await weekdayRows('lacmta-40-weekday', 'lacmta')).filter(p => p.routeShortName === '40' && p.directionId === 0); });
  const row = (headsign: string) => rows.find(p => p.headsign === headsign);

  it('Patsaouras reads every 10-11 in the PM peak from stop 45, its own trips before it', () => {
    // Stops 1-44: the pooled list thins to every ~20 after 17:20 (gaps 18-24), so the pooled
    // rule refuses it and the stop keeps its own value. Stop 86 is drop-off only for it, so it
    // has no departures and no value (CIV-1071).
    expect(periodRow(row('Patsaouras Transit Plaza'), 'pmPeak'))
      .toEqual(runs('22x24,21x20,11x17,10x24,-,10'));
  });

  it('Patsaouras keeps its own values outside the PM peak, and every row-level value', () => {
    const p = row('Patsaouras Transit Plaza');
    expect(periodRow(p, 'amPeak')).toEqual(runs('-x87'));
    expect(periodRow(p, 'midday')).toEqual(runs('-x87'));
    expect(periodRow(p, 'evening')).toEqual(runs(
      '-x24,99x6,98,99,98x7,97x13,96x8,76x4,75x11,95,96x2,95x2,37x3,36x2,-,36'));
    expect(p).toMatchObject({ headway: null, tier: '60', serviceClass: 'time-limited', routeAllDayHeadway: 10 });
    expect(p.headwayByPeriod).toMatchObject({ amPeak: null, midday: null, pmPeak: 18, evening: 36 });
    // The minimum stop values read the own pattern (#690), so they do not move either.
    expect(p.minStopHeadwayByPeriod).toEqual({ pmPeak: 18, evening: 36 });
    expect(p.sharedStretches).toBeUndefined();
    expect(Object.values(p.stopHeadways as Record<string, number>).every(v => v >= 18)).toBe(true);
  });

  it('the Division 13 line is unchanged: the rush trips never join what it reads', () => {
    const p = row('Division 13 Layover');
    // Stops 86 and 88 are drop-off only for it: no departures, no value (CIV-1071).
    expect(periodRow(p, 'pmPeak')).toEqual(runs('23x7,22x6,21x12,20x19,16x3,11x26,10x3,11,10,11x2,10x5,-,10,-'));
    expect(periodRow(p, 'amPeak')).toEqual(runs('10x6,9,10x5,9,10,9,10x55,11x15,-,11,-'));
    expect(periodRow(p, 'midday')).toEqual(runs('10x85,-,10,-'));
    expect(p).toMatchObject({ headway: 10, tier: '60', serviceClass: 'regular' });
    expect(p.headwayByPeriod).toMatchObject({ amPeak: 11, midday: 10, pmPeak: 23, evening: 33 });
  });
});

describe('what a rush-hour-only pattern still never changes (#720, CIV-850)', () => {
  it('LA Metro 105: the Marlton / King headline stays 27, Washington Fairfax gains no midday', async () => {
    const rows = (await weekdayRows('lacmta-105', 'lacmta')).filter(p => p.directionId === 0);
    expect(rows.find(p => p.headsign === 'Marlton / King Layover')).toMatchObject({ headway: 27 });
    const fairfax = rows.find(p => p.headsign === 'Washington Fairfax Hub');
    expect(fairfax.headwayByPeriod).toMatchObject({ amPeak: null, midday: null, pmPeak: 20 });
    for (const pk of ['amPeak', 'midday']) expect(periodRow(fairfax, pk).every(v => v == null)).toBe(true);
  });

  it('CDTA 233 to Pearl & Hudson stays 385', async () => {
    const rows = await weekdayRows('cdta-233', 'cdta');
    expect(rows.find(p => p.directionId === 1 && p.headsign === 'Pearl & Hudson')).toMatchObject({ headway: 385 });
  });

  it('a skip-stop rush express never reads its local where it skips stops (ETS 202)', async () => {
    // Real ETS feed, route 202 eastbound weekday: the AM Kingsway TC Express serves the local's
    // first 10 stops, skips its next 6, then serves its last 3. In order, every express stop is a
    // local stop, so an ordered alignment is one run over all 13; stop for stop, only the first 10.
    const rows = (await weekdayRows('edmonton-202', 'edmonton')).filter(p => p.directionId === 0);
    const express = rows.find(p => p.headsign === 'Kingsway Tc Express');
    const local = rows.find(p => p.headsign === 'Kingsway RAH Transit Centre');
    expect(alignedSharedRuns(express.stopOrder, local.stopOrder)).toEqual([[0, 12]]);
    const [header, ...lines] = readFileSync(resolve(__dirname, 'fixtures', 'edmonton-202', 'stops.txt'), 'utf8').trim().split('\n');
    const col = header.split(',');
    const stopsById = new Map(lines.map(line => line.split(',')).map(f => [f[col.indexOf('stop_id')], { lat: Number(f[col.indexOf('stop_lat')]), lon: Number(f[col.indexOf('stop_lon')]) }]));
    expect(contiguousSharedRuns(express.stopOrder, local.stopOrder, stopsById)).toEqual([[0, 9]]);
    expect(express).toMatchObject({ serviceClass: 'time-limited', headway: null });
    // Its last stop is drop-off only: no departures, no value (CIV-1071).
    expect(periodRow(express, 'amPeak')).toEqual(runs('20x12,-'));
    expect(periodRow(express, 'pmPeak')).toEqual(runs('-x13'));
  });
});

describe('the rush-pool read skips a skip-stop express (CIV-850)', () => {
  it('an express stopping at every other local stop keeps its own PM values', async () => {
    // Synthetic: local X1 every 10 all day over 20 stops; a PM express every 10, 5 minutes after
    // it, at every other stop. Each express stop is a local stop in order, so an ordered alignment
    // pools the two (every 5); no 5 consecutive local stops are express stops, so the read
    // must not happen and the express keeps its own every 10.
    const rows = (await weekdayRows('synthetic-skip-stop-express', 'synthetic')).filter(p => p.routeShortName === 'X1');
    const express = rows.find(p => p.headsign === 'Express Downtown');
    expect(express).toMatchObject({ serviceClass: 'time-limited', headway: null });
    expect(periodRow(express, 'pmPeak')).toEqual(runs('10x10'));
    expect(periodRow(rows.find(p => p.headsign === 'Downtown'), 'pmPeak')).toEqual(runs('10x20'));
  });
});

describe('contiguousSharedRuns (CIV-850)', () => {
  const stops = new Map(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id, i) => [id, { lat: 0, lon: i * 0.01 }]));
  it('keeps a run that serves every stop of the other pattern, at least 5 stops and 1 km', () => {
    expect(contiguousSharedRuns(['a', 'b', 'c', 'd', 'e', 'f'], ['x', 'a', 'b', 'c', 'd', 'e', 'f', 'y'], stops)).toEqual([[0, 5]]);
  });
  it('breaks at a skipped stop, where an ordered alignment does not', () => {
    const express = ['a', 'b', 'c', 'e', 'f', 'g', 'h'];
    const local = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    expect(alignedSharedRuns(express, local)).toEqual([[0, 6]]);
    expect(contiguousSharedRuns(express, local, stops)).toEqual([]);
  });
});
