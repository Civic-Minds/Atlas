import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { processGtfsBuffer } from '../process-core';

// #710: the Weekday stop groups used to pool every service that runs on any of Mon-Fri
// into one departure timeline. Two timetables that never run on the same day (Mon-Thu
// and Fri) then interleaved, and stop, period and coverage headways shrank. The stop
// groups now use one representative weekday per route and direction, picked by the same
// median-count rule as the route-level Weekday rollup.

const FIXTURES = resolve(__dirname, 'fixtures');

async function fixtureZip(name: string): Promise<Buffer> {
  const zip = new JSZip();
  const dir = resolve(FIXTURES, name);
  for (const file of readdirSync(dir)) zip.file(file, readFileSync(resolve(dir, file)));
  return zip.generateAsync({ type: 'nodebuffer' });
}

function hm(mins: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}:00`;
}

type Service = { id: string; days: string; every: number; offset?: number };

// One route, three stops, a straight shape. `days` is the calendar.txt Mon..Sun mask.
async function syntheticFeed(services: Service[]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('agency.txt', 'agency_id,agency_name,agency_url,agency_timezone\na,Weekday Transit,https://example.test,America/Toronto\n');
  zip.file('routes.txt', 'route_id,route_short_name,route_long_name,route_type\nr1,1,Main Street,3\n');
  zip.file('stops.txt', 'stop_id,stop_name,stop_lat,stop_lon\ns1,First Stop,43.65,-79.38\ns2,Middle Stop,43.655,-79.375\ns3,Last Stop,43.66,-79.37\n');
  zip.file('shapes.txt', [
    'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence',
    'sh1,43.65,-79.38,1',
    'sh1,43.655,-79.375,2',
    'sh1,43.66,-79.37,3',
  ].join('\n') + '\n');
  zip.file('calendar.txt', [
    'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date',
    ...services.map(s => `${s.id},${s.days.split('').join(',')},20260105,20261220`),
  ].join('\n') + '\n');
  const trips = ['route_id,service_id,trip_id,trip_headsign,direction_id,shape_id'];
  const stopTimes = ['trip_id,arrival_time,departure_time,stop_id,stop_sequence'];
  for (const service of services) {
    for (let start = 6 * 60 + (service.offset ?? 0); start <= 22 * 60; start += service.every) {
      const id = `${service.id}-${start}`;
      trips.push(`r1,${service.id},${id},Downtown,0,sh1`);
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

async function routeFeatures(buf: Buffer, slug: string): Promise<any[]> {
  const result = await processGtfsBuffer(buf, undefined, { slug });
  return JSON.parse(result.geojson).features
    .map((feature: any) => feature.properties)
    .filter((p: any) => p.stopId == null);
}

describe('Weekday stop groups use one representative weekday (#710)', () => {
  it('does not interleave a Mon-Thu timetable with a different Friday timetable', async () => {
    // Every 20 min Mon-Thu, every 20 min Friday but 10 minutes later. Pooled, the stops
    // saw a bus every 10 minutes, which never happens on any real day.
    const features = await routeFeatures(await syntheticFeed([
      { id: 'monthu', days: '1111000', every: 20 },
      { id: 'fri', days: '0000100', every: 20, offset: 10 },
    ]), 'weekday-split');
    const weekday = features.find(p => p.day === 'Weekday');

    expect(weekday.headway).toBe(20);
    expect(weekday.headwayByPeriod.midday).toBe(20);
    expect(weekday.headwayByPeriod.evening).toBe(20);
    expect(weekday.periodCoverageHeadway.midday).toBe(20);
    for (const headway of Object.values(weekday.stopHeadways) as number[]) expect(headway).toBe(20);
  });

  it('uses the typical weekday, not the day with extra trips', async () => {
    // Mon-Thu every 30; Friday adds a second, offset service. Friday is one day of five,
    // so the representative weekday (median count) is a Mon-Thu day, as at route level.
    const features = await routeFeatures(await syntheticFeed([
      { id: 'weekdays', days: '1111100', every: 30 },
      { id: 'fri-extra', days: '0000100', every: 30, offset: 15 },
    ]), 'weekday-friday-extra');
    const weekday = features.find(p => p.day === 'Weekday');

    expect(weekday.headway).toBe(30);
    expect(weekday.headwayByPeriod.midday).toBe(30);
    for (const headway of Object.values(weekday.stopHeadways) as number[]) expect(headway).toBe(30);
  });

  it('keeps Weekday stop data for a feed with no Monday service (Tue-Fri)', async () => {
    const features = await routeFeatures(await syntheticFeed([
      { id: 'tuefri', days: '0111100', every: 15 },
    ]), 'tue-fri');
    const weekday = features.find(p => p.day === 'Weekday');

    expect(weekday).toBeDefined();
    expect(Object.keys(weekday.stopHeadways ?? {})).toEqual(expect.arrayContaining(['s1', 's2', 's3']));
    expect(weekday.headwayByPeriod.midday).toBe(15);
  });

  it('puts a service that runs all week into the Weekday, Saturday and Sunday stop groups', async () => {
    const features = await routeFeatures(await syntheticFeed([
      { id: 'daily', days: '1111111', every: 12 },
    ]), 'daily');

    for (const day of ['Weekday', 'Saturday', 'Sunday']) {
      const feature = features.find(p => p.day === day);
      expect(feature, day).toBeDefined();
      expect(Object.keys(feature.stopHeadways ?? {}), day).toEqual(expect.arrayContaining(['s1', 's2', 's3']));
      expect(feature.headwayByPeriod.midday, day).toBe(12);
    }
  });

  it('cata-state-college White Loop: Mon-Thu and Friday timetables are not interleaved', async () => {
    // Real feed 20260817-20261213, route 57 only: service 90 runs Mon-Thu, service 54
    // Fridays, both calendar_dates-only. Each trip keeps its first two stops and its last.
    // Hand count of the Mon-Thu service: AM 5-6, midday 5, PM 6, evening 12, last trip
    // about midnight. Friday's service runs to 02:26.
    const features = await routeFeatures(await fixtureZip('cata-white-loop-mon-thu-fri'), 'cata-state-college');
    const weekday = features.filter(p => p.day === 'Weekday' && p.tier !== 'span');

    expect(weekday.map(p => p.directionId).sort()).toEqual([0, 1]);
    // Before the fix: midday 3, PM 3, evening 3, and Friday's overnight trips.
    for (const p of weekday) {
      expect(p.headwayByPeriod).toMatchObject({ amPeak: 6, midday: 5, pmPeak: 6, evening: 12, late: 12, overnight: null });
    }
  });

  it('uga C-N: a Mon-Wed template trip does not change the Thu-Sat night timetable', async () => {
    // Real feed 20260911, route 5742 (C-N) only: service 73973.218867 (Mon-Wed) has one
    // template trip with no frequencies.txt rows; 73973.220856 (Thu-Sat) runs every 1000 s
    // from 18:30. The weekday representative day is Thursday, so Weekday stop values must
    // match Saturday's, which only ever had the Thu-Sat service.
    const features = await routeFeatures(await fixtureZip('uga-cn-night-services'), 'uga');
    const weekday = features.find(p => p.day === 'Weekday');
    const saturday = features.find(p => p.day === 'Saturday');

    expect(weekday.headwayByPeriod).toEqual(saturday.headwayByPeriod);
    expect(weekday.periodCoverageHeadway).toEqual(saturday.periodCoverageHeadway);
  });

  it('clemson-cat TL-24: a Thu-Fri night route uses one weekday at stop and route level', async () => {
    // Real feed, route TL-24 only: TL-294 runs Thu+Fri 17:45-23:59 every 1601 s and
    // TL-275 the Fri+Sat 00:00-02:45 tail. Friday (the median-count day) represents
    // the weekday at both levels, so the stop and route values agree. Whether a route that
    // runs on 2 of 5 weekdays should be shown as weekday service at all is a separate
    // product decision; the route-level rollup currently keeps its tier.
    const features = await routeFeatures(await fixtureZip('clemson-tl24-thu-fri'), 'clemson-cat');
    const weekday = features.find(p => p.day === 'Weekday');

    expect(weekday.headway).toBe(27);
    expect(weekday.tier).toBe('30');
    expect(weekday.headwayByPeriod.evening).toBe(27);
    expect(weekday.headwayByPeriod.late).toBe(27);
  });
});
