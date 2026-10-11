import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { processGtfsBuffer } from '../process-core';
import { routePassesHeadwayFilter } from '../../shared/routeHeadwayFilter';
import { isLimitedService } from '../../shared/irregularRoutes';
import { tileLimitedServiceExpr } from '../../shared/tileFilterExprs';
import { prepareAgencyRouteFeaturesForTiles as prepareAgencyRoutesForTiles } from '../prepareAgencyRoutesForTiles';

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
async function syntheticFeed(services: Service[], startDate = '20260107', endDate = '20261220'): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(await syntheticFiles(services, startDate, endDate))) zip.file(name, content);
  return zip.generateAsync({ type: 'nodebuffer' });
}

// Feed files as strings, so a test can append rows. 20260107 is a Wednesday.
async function syntheticFiles(services: Service[], startDate: string, endDate: string): Promise<Record<string, string>> {
  const zip = { files: {} as Record<string, string>, file(name: string, content: string) { this.files[name] = content; } };
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
    ...services.map(s => `${s.id},${s.days.split('').join(',')},${startDate},${endDate}`),
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
  return zip.files;
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

  it('uga C-N: a route with real service on only Thu-Fri is a limited weekday route', async () => {
    // Real feed 20260911, route 5742 (C-N) only: service 73973.218867 (Mon-Wed) has one
    // template trip with no frequencies.txt rows; 73973.220856 (Thu-Sat) runs every 1000 s
    // from 18:30. Mon-Wed have fewer than two departures, so the representative weekday has
    // no service and the Weekday tier is infrequent with no headway. Saturday is unaffected.
    const features = await routeFeatures(await fixtureZip('uga-cn-night-services'), 'uga');
    const weekday = features.find(p => p.day === 'Weekday');
    const saturday = features.find(p => p.day === 'Saturday');

    expect(weekday.tier).toBe('infrequent');
    expect(weekday.headway).toBeNull();
    expect(saturday.tier).toBe('20');
  });

  it('clemson-cat TL-24: a Thu+Fri night route gets the weekday tier infrequent, not 30', async () => {
    // Real feed, route TL-24 only: TL-294 runs Thu+Fri (calendar 0,0,0,1,1,0,0) 17:45-23:59
    // every 1601 s and TL-275 the Fri+Sat 00:00-02:45 tail. The representative weekday is
    // chosen over all five weekdays, so it has no TL-24 service: the route is shown as
    // limited on weekdays (Ryan, 2026-10-11), not as tier 30 from the days it runs.
    const features = await routeFeatures(await fixtureZip('clemson-tl24-thu-fri'), 'clemson-cat');
    const weekday = features.find(p => p.day === 'Weekday');

    expect(weekday).toBeDefined();
    expect(weekday.tier).toBe('infrequent');
    expect(weekday.headway).toBeNull();
    expect(Object.values(weekday.headwayByPeriod).every(v => v == null)).toBe(true);
    expect(weekday.stopHeadways ?? {}).toEqual({});
    // Saturday keeps its own timetable.
    expect(features.find(p => p.day === 'Saturday').tier).toBe('30');
  });

  it('a service that starts mid-week still represents the weekday', async () => {
    // A Wed-Fri service (3 of 5 weekdays) and a Mon-Fri timetable whose start_date is a
    // Wednesday both keep Weekday stop and route values.
    for (const days of ['0011100', '1111100']) {
      const zip = await syntheticFeed([{ id: 'svc', days, every: 15 }]);
      const features = await routeFeatures(zip, `midweek-${days}`);
      const weekday = features.find(p => p.day === 'Weekday');
      expect(weekday.tier, days).toBe('15');
      expect(weekday.headwayByPeriod.midday, days).toBe(15);
      expect(Object.keys(weekday.stopHeadways ?? {}), days).toEqual(expect.arrayContaining(['s1', 's2', 's3']));
    }
  });

  it('a holiday Monday in the reference week does not reach the Weekday stop maps', async () => {
    // Regular Mon-Fri service every 10 min; on Monday 2026-10-19 (the Monday of the reference week; reference date Oct 17) it is removed and a holiday
    // service every 30 min is added (calendar_dates). Stop values must be the regular 10.
    const zip = new JSZip();
    for (const [name, content] of Object.entries(await syntheticFiles([{ id: 'regular', days: '1111100', every: 10 }], '20261005', '20261030'))) zip.file(name, content);
    const holidayTrips: string[] = [];
    const holidayStopTimes: string[] = [];
    for (let start = 7 * 60; start <= 21 * 60; start += 30) {
      const id = `holiday-${start}`;
      holidayTrips.push(`r1,holiday,${id},Downtown,0,sh1`);
      holidayStopTimes.push(`${id},${hm(start + 3)},${hm(start + 3)},s1,1`, `${id},${hm(start + 8)},${hm(start + 8)},s2,2`, `${id},${hm(start + 13)},${hm(start + 13)},s3,3`);
    }
    zip.file('trips.txt', (await zip.file('trips.txt')!.async('string')) + holidayTrips.join('\n') + '\n');
    zip.file('stop_times.txt', (await zip.file('stop_times.txt')!.async('string')) + holidayStopTimes.join('\n') + '\n');
    zip.file('calendar_dates.txt', 'service_id,date,exception_type\nregular,20261019,2\nholiday,20261019,1\n');
    const features = await routeFeatures(await zip.generateAsync({ type: 'nodebuffer' }), 'holiday-monday');
    const weekday = features.find(p => p.day === 'Weekday');

    expect(weekday.headwayByPeriod.midday).toBe(10);
    for (const headway of Object.values(weekday.stopHeadways) as number[]) expect(headway).toBe(10);
  });

  it('a partial-weekday route still draws as limited under "any frequency" in a period it runs', async () => {
    // TL-24 runs Thu+Fri 17:45-02:45. Weekday evening + any frequency must show it (limited);
    // a frequency threshold (every 30) must hide it. uga C-N (Thu-Fri from 18:30) likewise.
    for (const [fixture, slug] of [['clemson-tl24-thu-fri', 'clemson-cat'], ['uga-cn-night-services', 'uga']] as const) {
      const weekday = (await routeFeatures(await fixtureZip(fixture), slug)).filter(p => p.day === 'Weekday');
      expect(weekday.every(p => p.tier === 'infrequent'), fixture).toBe(true);
      expect(routePassesHeadwayFilter(weekday, 'evening', 'Weekday', Infinity), fixture).toBe(true);
      expect(routePassesHeadwayFilter(weekday, 'evening', 'Weekday', 30), fixture).toBe(false);
      expect(routePassesHeadwayFilter(weekday, 'evening', 'Weekday', 60), fixture).toBe(false);
      // No service in the morning on any weekday: hidden even under "any frequency".
      expect(routePassesHeadwayFilter(weekday, 'amPeak', 'Weekday', Infinity), fixture).toBe(false);
    }
  });

  it('the same rule holds on the tile path (flattened properties)', async () => {
    const result = await processGtfsBuffer(await fixtureZip('clemson-tl24-thu-fri'), undefined, { slug: 'clemson-cat' });
    const tiles = prepareAgencyRoutesForTiles(JSON.parse(result.geojson).features, 'clemson-cat')
      .map(f => f.properties)
      .filter((p: any) => p.day === 'Weekday');
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.every((p: any) => p.pws_evening === true && p.pws_amPeak === false)).toBe(true);
    expect(routePassesHeadwayFilter(tiles, 'evening', 'Weekday', Infinity)).toBe(true);
    expect(routePassesHeadwayFilter(tiles, 'evening', 'Weekday', 30)).toBe(false);
  });

  it('a frequent all-week route is unchanged by the partial-weekday rule', async () => {
    const features = await routeFeatures(await syntheticFeed([{ id: 'daily', days: '1111111', every: 12 }]), 'frequent');
    const weekday = features.filter(p => p.day === 'Weekday');
    expect(weekday[0].partialWeekdayServiceByPeriod).toBeUndefined();
    expect(routePassesHeadwayFilter(weekday, 'evening', 'Weekday', Infinity)).toBe(true);
    expect(routePassesHeadwayFilter(weekday, 'midday', 'Weekday', 15)).toBe(true);
    expect(routePassesHeadwayFilter(weekday, 'midday', 'Weekday', 10)).toBe(false);
  });

  it('the "hide limited" toggle decides whether a partial-weekday route shows under any frequency', async () => {
    // Ryan, 2026-10-11: TL-24 behaves like any other limited route. Toggle off: shown as
    // limited under "Weekday evening, any frequency". Toggle on: hidden. Thresholds hide it.
    const weekday = (await routeFeatures(await fixtureZip('clemson-tl24-thu-fri'), 'clemson-cat')).filter(p => p.day === 'Weekday');
    const visible = (hideLimited: boolean, maxHeadway: number) =>
      weekday.filter(p => !(hideLimited && isLimitedService(p))).length > 0
      && routePassesHeadwayFilter(weekday.filter(p => !(hideLimited && isLimitedService(p))), 'evening', 'Weekday', maxHeadway);

    expect(weekday.every(p => p.serviceClass === 'time-limited')).toBe(true);
    expect(visible(false, Infinity)).toBe(true);
    expect(visible(true, Infinity)).toBe(false);
    expect(visible(false, 30)).toBe(false);
    // The map's tile clause for the toggle keys on the same serviceClass value.
    expect(JSON.stringify(tileLimitedServiceExpr())).toContain('"time-limited"');
  });

  it('LANTA Green Line: one shape per weekday is still a route that runs every weekday', async () => {
    // Real feed, route 1 weekday services 30/29/28/27/16 (calendar_dates, Mon/Tue/Wed/Thu/Fri
    // only), each day's trips on their own shape. Every pattern runs on one weekday, the route
    // on five. Regression from the full dry run: all 72 LANTA weekday features showed limited.
    const weekday = (await routeFeatures(await fixtureZip('lanta-1-shape-per-weekday'), 'lanta')).filter(p => p.day === 'Weekday');

    expect(weekday.length).toBeGreaterThan(0);
    for (const p of weekday) {
      expect(p.partialWeekdayServiceByPeriod).toBeUndefined();
      expect(p.tier).not.toBe('infrequent');
      expect(p.headway).toBeGreaterThan(0);
      expect(p.headwayByPeriod.midday).toBeGreaterThan(0);
    }
  });

  it('SLU Streetcar: weekdays added through calendar_dates count as service', async () => {
    // Real feed, route 100340, service 128666: calendar.txt says Tue+Wed, and calendar_dates
    // adds it on every Mon, Thu and Fri. It runs every weekday about every 12 minutes.
    const weekday = (await routeFeatures(await fixtureZip('slu-streetcar-calendar-dates-weekdays'), 'seattle-streetcar')).filter(p => p.day === 'Weekday');

    expect(weekday.map(p => p.directionId).sort()).toEqual([0, 1]);
    for (const p of weekday) {
      expect(p.partialWeekdayServiceByPeriod).toBeUndefined();
      expect(p.headway).toBe(12);
      expect(p.headwayByPeriod.midday).toBe(12);
    }
  });
});
