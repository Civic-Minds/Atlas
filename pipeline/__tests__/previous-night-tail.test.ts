import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { processGtfsBuffer } from '../process-core';
import { previousNightTailDays } from '../transit-phase2';
import { normalizeRouteFilterFeatures, routePassesHeadwayFilter } from '../../shared/routeHeadwayFilter';
import type { DayName, RawRouteDepartures } from '../../types/gtfs';

// #718: a night's after-midnight trips written as 00:00+ times under a service active the next
// calendar day made that next day look like it had late-night service of its own.

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

const range = (from: number, to: number, every: number) => {
  const out: number[] = [];
  for (let t = from; t <= to; t += every) out.push(t);
  return out;
};

type Service = { id: string; days: string; departures: number[] };

// One route, one direction, three stops. `days` is the calendar.txt Mon..Sun mask.
async function syntheticFeed(services: Service[]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('agency.txt', 'agency_id,agency_name,agency_url,agency_timezone\na,Night Transit,https://example.test,America/Toronto\n');
  zip.file('routes.txt', 'route_id,route_short_name,route_long_name,route_type\nr1,1,Main Street,3\n');
  zip.file('stops.txt', 'stop_id,stop_name,stop_lat,stop_lon\ns1,First Stop,43.65,-79.38\ns2,Middle Stop,43.655,-79.375\ns3,Last Stop,43.66,-79.37\n');
  zip.file('shapes.txt', 'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\nsh1,43.65,-79.38,1\nsh1,43.655,-79.375,2\nsh1,43.66,-79.37,3\n');
  zip.file('calendar.txt', [
    'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date',
    ...services.map(s => `${s.id},${s.days.split('').join(',')},20260107,20261220`),
  ].join('\n') + '\n');
  const trips = ['route_id,service_id,trip_id,trip_headsign,direction_id,shape_id'];
  const stopTimes = ['trip_id,arrival_time,departure_time,stop_id,stop_sequence'];
  for (const service of services) {
    for (const start of service.departures) {
      const id = `${service.id}-${start}`;
      trips.push(`r1,${service.id},${id},Downtown,0,sh1`);
      stopTimes.push(`${id},${hm(start)},${hm(start)},s1,1`, `${id},${hm(start + 5)},${hm(start + 5)},s2,2`, `${id},${hm(start + 10)},${hm(start + 10)},s3,3`);
    }
  }
  zip.file('trips.txt', trips.join('\n') + '\n');
  zip.file('stop_times.txt', stopTimes.join('\n') + '\n');
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function routeFeatures(buf: Buffer, slug: string): Promise<any[]> {
  const result = await processGtfsBuffer(buf, undefined, { slug });
  const features = JSON.parse(result.geojson).features.filter((f: any) => f.properties.stopId == null);
  normalizeRouteFilterFeatures(features);
  return features.map((f: any) => f.properties);
}

const passes = (features: any[], day: string, period: 'all' | 'late', max: number) =>
  routePassesHeadwayFilter(features, period, day, max);

describe('a day whose only service is the previous night\'s tail (#718)', () => {
  it('clemson-cat TL-24: Sunday 00:00-02:30 is Saturday night, not Sunday tier 30', async () => {
    // Real feed, route TL-24 only (frequencies.txt, every 1601 s): TL-276 Saturday 17:00-23:59,
    // TL-293 Sunday 00:00-02:30. Sunday has no daytime or evening service of its own.
    const features = await routeFeatures(await fixtureZip('clemson-tl24-thu-fri'), 'clemson-cat');
    const sunday = features.filter(p => p.day === 'Sunday');
    expect(sunday).toHaveLength(1);
    expect(sunday[0].tier).toBe('infrequent');
    expect(sunday[0].serviceClass).toBe('time-limited');
    expect(sunday[0].headway).toBeNull();
    expect(Object.values(sunday[0].headwayByPeriod).every(v => v == null)).toBe(true);
    for (const max of [30, 60]) {
      expect(passes(features, 'Sunday', 'all', max), `all-day ${max}`).toBe(false);
      expect(passes(features, 'Sunday', 'late', max), `late ${max}`).toBe(false);
    }
    // The tail marks no period as served, so "any frequency" does not draw it in any period.
    expect(sunday[0].partialWeekdayServiceByPeriod).toBeUndefined();
    for (const period of ['evening', 'late', 'overnight'] as const) {
      expect(routePassesHeadwayFilter(features, period, 'Sunday', Infinity), `any ${period}`).toBe(false);
    }
    // Saturday has its own evening service and keeps its tier.
    expect(features.find(p => p.day === 'Saturday').tier).toBe('30');
    expect(passes(features, 'Saturday', 'all', 30)).toBe(true);
  });

  it('leaves a 24-hour route alone', async () => {
    const allDay = await routeFeatures(await syntheticFeed([
      { id: 'all', days: '1111111', departures: range(0, 23 * 60 + 30, 30) },
    ]), 'tail-24h');
    const sunday = allDay.find(p => p.day === 'Sunday');
    expect(sunday.tier).toBe('30');
    expect(sunday.headway).toBe(30);
    expect(passes(allDay, 'Sunday', 'late', 30)).toBe(true);
  });

  it('leaves an overnight-only (owl) route alone', async () => {
    // 01:00-05:00 every 30 min every night, nothing else: the previous day ends near 05:00,
    // hours before the next night starts, so no day is a tail.
    const owl = await routeFeatures(await syntheticFeed([
      { id: 'owl', days: '1111111', departures: range(60, 300, 30) },
    ]), 'tail-owl');
    const sunday = owl.find(p => p.day === 'Sunday');
    expect(sunday.tier).toBe('30');
    expect(sunday.headway).toBe(30);
  });

  it('leaves real early-morning Sunday service alone', async () => {
    // Saturday runs to 23:30; Sunday starts at 04:30. The 5-hour gap is not a continuation.
    const early = await routeFeatures(await syntheticFeed([
      { id: 'sat', days: '0000010', departures: range(7 * 60, 23 * 60 + 30, 30) },
      { id: 'sun', days: '0000001', departures: range(4 * 60 + 30, 5 * 60 + 50, 20) },
    ]), 'tail-early');
    const sunday = early.find(p => p.day === 'Sunday');
    expect(sunday.tier).toBe('20');
    expect(sunday.headway).not.toBeNull();
  });

  it('a weekday that only carries the previous night\'s tail does not set the Weekday tier', async () => {
    // Mon-Thu 07:00-23:30 every 15; Friday has only Thursday night's 00:00-02:00 tail, hourly.
    // The Weekday tier comes from Mon-Thu, not from the tail's 60.
    const features = await routeFeatures(await syntheticFeed([
      { id: 'monthu', days: '1111000', departures: range(7 * 60, 23 * 60 + 30, 15) },
      { id: 'fritail', days: '0000100', departures: range(0, 120, 60) },
    ]), 'tail-weekday');
    const weekday = features.find(p => p.day === 'Weekday');
    expect(weekday.tier).toBe('15');
    expect(weekday.serviceClass).toBe('regular');
  });

  it('a route on two weekday nights stays limited and drawn under any frequency (tail day is unserved)', async () => {
    // Mon+Tue 17:00-23:30, each night's tail 00:00-02:00 under a Tue+Wed service. Wednesday's
    // only trips are Tuesday night's tail, so only 2 of 5 weekdays have service of their own.
    const features = await routeFeatures(await syntheticFeed([
      { id: 'nights', days: '1100000', departures: range(17 * 60, 23 * 60 + 30, 30) },
      { id: 'tails', days: '0110000', departures: range(0, 120, 30) },
    ]), 'tail-two-nights');
    const weekday = features.find(p => p.day === 'Weekday');
    expect(weekday.tier).toBe('infrequent');
    expect(weekday.headway).toBeNull();
    expect(weekday.partialWeekdayServiceByPeriod).toMatchObject({ amPeak: false, midday: false, evening: true, late: true });
    expect(routePassesHeadwayFilter(features, 'evening', 'Weekday', Infinity)).toBe(true);
    expect(routePassesHeadwayFilter(features, 'late', 'Weekday', Infinity)).toBe(true);
    expect(routePassesHeadwayFilter(features, 'evening', 'Weekday', 60)).toBe(false);
    expect(routePassesHeadwayFilter(features, 'amPeak', 'Weekday', Infinity)).toBe(false);
  });

  it('a partial-weekday route that runs only after midnight still marks the late period', async () => {
    // Thu+Fri 00:30-01:30 only (plus nothing the evening before): 00:30 is late, not no period.
    const features = await routeFeatures(await syntheticFeed([
      { id: 'late', days: '0001100', departures: range(30, 90, 30) },
    ]), 'tail-after-midnight-only');
    const weekday = features.find(p => p.day === 'Weekday');
    expect(weekday.tier).toBe('infrequent');
    expect(weekday.partialWeekdayServiceByPeriod).toMatchObject({ late: true, evening: false });
  });

  it('leaves genuine 05:00 early-Sunday service alone', async () => {
    // Saturday runs to 23:59; Sunday has only 05:00-05:50. Five hours apart: not a tail.
    const early = await routeFeatures(await syntheticFeed([
      { id: 'sat', days: '0000010', departures: [...range(7 * 60, 23 * 60 + 30, 30), 23 * 60 + 59] },
      { id: 'sun', days: '0000001', departures: range(5 * 60, 5 * 60 + 50, 10) },
    ]), 'tail-five-am');
    const sunday = early.find(p => p.day === 'Sunday');
    expect(sunday.tier).toBe('10');
    expect(sunday.headway).toBe(10);
  });

  it('leaves a day with its own service alone even when it also carries a tail', async () => {
    const both = await routeFeatures(await syntheticFeed([
      { id: 'sat', days: '0000010', departures: range(7 * 60, 23 * 60 + 30, 30) },
      { id: 'suntail', days: '0000001', departures: range(0, 120, 30) },
      { id: 'sunday', days: '0000001', departures: range(9 * 60, 20 * 60, 30) },
    ]), 'tail-both');
    expect(both.find(p => p.day === 'Sunday').tier).toBe('30');
  });
});

describe('previousNightTailDays', () => {
  const raw = (day: DayName, departureTimes: number[]): RawRouteDepartures => ({
    route: 'r', dir: '0', day, routeType: '3', modeName: 'Bus', departureTimes, gaps: [],
    serviceSpan: { start: departureTimes[0], end: departureTimes[departureTimes.length - 1] },
    tripCount: departureTimes.length,
  } as RawRouteDepartures);

  it('flags only a short-gap continuation that ends before 06:00', () => {
    expect([...previousNightTailDays([raw('Saturday', range(1020, 1420, 27)), raw('Sunday', range(0, 133, 27))])])
      .toEqual(['r::0::Sunday']);
    // Monday's previous day is Sunday.
    expect([...previousNightTailDays([raw('Sunday', range(600, 1430, 30)), raw('Monday', range(10, 100, 30))])])
      .toEqual(['r::0::Monday']);
    // Gap over 90 minutes, a day with later service, or no service the previous day: not a tail.
    expect(previousNightTailDays([raw('Saturday', range(1020, 1300, 30)), raw('Sunday', range(60, 150, 30))]).size).toBe(0);
    expect(previousNightTailDays([raw('Saturday', range(1020, 1420, 30)), raw('Sunday', [...range(0, 120, 30), 400])]).size).toBe(0);
    expect(previousNightTailDays([raw('Sunday', range(0, 120, 30))]).size).toBe(0);
    // The previous day already runs past 24:00 (24:00+ times reach 25:00), so this day's
    // 00:00-02:00 trips are not its continuation: the gap is negative.
    expect(previousNightTailDays([raw('Saturday', range(1020, 1500, 30)), raw('Sunday', range(0, 120, 30))]).size).toBe(0);
    // A genuine 05:00 Sunday start after a 23:59 finish.
    expect(previousNightTailDays([raw('Saturday', [...range(1020, 1410, 30), 1439]), raw('Sunday', range(300, 350, 10))]).size).toBe(0);
  });
});
