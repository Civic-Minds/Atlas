import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { processAgencyFeeds } from '../agencyFeeds';

// Sound Transit (#1035, release-mvf8jscd): light rail, Sounder and T Line share one main feed.
// Link's long-range Saturday and Sunday services are removed every weekend from Oct 17 to
// Nov 15 and replaced by one-day calendar_dates services (rail milling, closures). The default
// calendar logic reads one reference date and skips one-day ids while the T Line's long-range
// weekend service keeps the day non-empty, so the 1 Line and 2 Line showed Weekday only. A
// weekend shuttle bus period (Oct 17 to Nov 15) pulls the reference date into that stretch.
// The main feed opts in by listing its feedUrl in nextServiceDatesFeedUrls. Run date: Wed Oct 21, 2026.

const RUN = new Date('2026-10-21T08:00:00');
const MAIN_URL = 'https://example.test/main.zip';
const HEADER = 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date';

function minutes(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
}

/**
 * L (light rail), T (a line with its own long-range weekend service) and X (weekend shuttle bus).
 * With `sounder`, also S: a weekday-only commuter rail line with game-day Sunday trains (a
 * two-Sunday row Oct 4-11 and a one-day row Nov 8), as Sounder's Seahawks services (CIV-445).
 */
async function soundTransitZip({ sounder = false } = {}): Promise<Buffer> {
  const calendar = [
    'L-wk,1,1,1,1,1,0,0,20261019,20270326',
    'L-sat,0,0,0,0,0,1,0,20261003,20270327',
    'L-sun,0,0,0,0,0,0,1,20261004,20270328',
    'T-wk,1,1,1,1,1,0,0,20261001,20270326',
    'T-sat,0,0,0,0,0,1,0,20261001,20270320',
    'T-sun,0,0,0,0,0,0,1,20261001,20270321',
    'X-sat,0,0,0,0,0,1,0,20261017,20261115',
    'X-sun,0,0,0,0,0,0,1,20261017,20261115',
    ...(sounder ? [
      'S-wk,1,1,1,1,1,0,0,20261001,20270326',
      'S-hawks-1004,0,0,0,0,0,0,1,20261004,20261011',
      'S-hawks-1108,0,0,0,0,0,0,1,20261108,20261108',
    ] : []),
  ];
  // Like the real feed: every weekend from Oct 17 to Nov 15 runs a one-day replacement.
  const weekends = [['20261017', '20261018'], ['20261024', '20261025'], ['20261031', '20261101'], ['20261107', '20261108'], ['20261114', '20261115']];
  const calendarDates = ['service_id,date,exception_type'];
  for (const [sat, sun] of weekends) {
    calendarDates.push(`L-sat,${sat},2`, `L-sun,${sun},2`, `L-sat-${sat},${sat},1`, `L-sun-${sun},${sun},1`);
  }
  // The shuttle runs only on the first and last weekend of its period.
  for (const [sat, sun] of weekends.slice(1, -1)) calendarDates.push(`X-sat,${sat},2`, `X-sun,${sun},2`);
  // Service id -> [route, minutes between trips].
  const services: Array<[string, string, number]> = [
    ['L-wk', 'L', 10], ['L-sat', 'L', 10], ['L-sun', 'L', 10],
    ...weekends.flatMap(([sat, sun]): Array<[string, string, number]> => [[`L-sat-${sat}`, 'L', 10], [`L-sun-${sun}`, 'L', 10]]),
    ['T-wk', 'T', 12], ['T-sat', 'T', 12], ['T-sun', 'T', 20],
    ['X-sat', 'X', 15], ['X-sun', 'X', 15],
    ...(sounder ? [['S-wk', 'S', 30], ['S-hawks-1004', 'S', 120], ['S-hawks-1108', 'S', 120]] as Array<[string, string, number]> : []),
  ];
  const zip = new JSZip();
  zip.file('agency.txt', 'agency_id,agency_name,agency_url,agency_timezone\nst,Sound Transit,https://example.test,America/Los_Angeles\n');
  zip.file('routes.txt', 'route_id,route_short_name,route_long_name,route_type\nL,1 Line,Light rail,0\nT,T Line,Tacoma,0\nX,Shuttle,Shuttle bus,3\n' + (sounder ? 'S,S Line,Commuter rail,2\n' : ''));
  zip.file('stops.txt', [
    'stop_id,stop_name,stop_lat,stop_lon',
    'l1,L North,47.70,-122.30', 'l2,L South,47.50,-122.30',
    't1,T West,47.25,-122.45', 't2,T East,47.25,-122.40',
    'x1,X North,47.70,-122.32', 'x2,X South,47.60,-122.32',
    ...(sounder ? ['s1,S North,47.60,-122.33', 's2,S South,47.25,-122.44'] : []),
  ].join('\n') + '\n');
  zip.file('shapes.txt', [
    'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence',
    'shL,47.70,-122.30,1', 'shL,47.60,-122.30,2', 'shL,47.50,-122.30,3',
    'shT,47.25,-122.45,1', 'shT,47.25,-122.425,2', 'shT,47.25,-122.40,3',
    'shX,47.70,-122.32,1', 'shX,47.65,-122.32,2', 'shX,47.60,-122.32,3',
    ...(sounder ? ['shS,47.60,-122.33,1', 'shS,47.42,-122.38,2', 'shS,47.25,-122.44,3'] : []),
  ].join('\n') + '\n');
  zip.file('calendar.txt', [HEADER, ...calendar].join('\n') + '\n');
  zip.file('calendar_dates.txt', calendarDates.join('\n') + '\n');
  const trips = ['route_id,service_id,trip_id,trip_headsign,direction_id,shape_id'];
  const stopTimes = ['trip_id,arrival_time,departure_time,stop_id,stop_sequence'];
  for (const [serviceId, route, every] of services) {
    const [s1, s2] = route === 'L' ? ['l1', 'l2'] : route === 'T' ? ['t1', 't2'] : route === 'S' ? ['s1', 's2'] : ['x1', 'x2'];
    for (let m = 6 * 60, i = 0; m <= 22 * 60; m += every, i++) {
      const id = `${serviceId}-${i}`;
      trips.push(`${route},${serviceId},${id},${route} terminal,0,sh${route}`);
      stopTimes.push(`${id},${minutes(m)},${minutes(m)},${s1},1`, `${id},${minutes(m + 20)},${minutes(m + 20)},${s2},2`);
    }
  }
  zip.file('trips.txt', trips.join('\n') + '\n');
  zip.file('stop_times.txt', stopTimes.join('\n') + '\n');
  return zip.generateAsync({ type: 'nodebuffer' });
}

type Props = { routeId: string; day: string; headway: number | null };
function lineFeatures(geojson: string): Props[] {
  return JSON.parse(geojson).features
    .filter((f: { geometry?: { type?: string } }) => f.geometry?.type !== 'Point')
    .map((f: { properties: Props }) => f.properties);
}
function daysByRoute(props: Props[]): Record<string, string[]> {
  const out: Record<string, Set<string>> = {};
  for (const p of props) (out[p.routeId] ??= new Set()).add(p.day);
  return Object.fromEntries(Object.entries(out).map(([r, s]) => [r, [...s].sort()]));
}

describe('nextServiceDatesFeedUrls naming the main feed (Sound Transit, #1035)', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'], now: RUN }); });
  afterEach(() => { vi.useRealTimers(); });

  it('the old picker loses the light rail weekend while the other line keeps it (the reported bug)', async () => {
    const plain = await processAgencyFeeds(await soundTransitZip(), [], { slug: 'st', feedUrl: MAIN_URL }, { legacyReferenceDate: true });
    expect(daysByRoute(lineFeatures(plain.geojson))).toEqual({ L: ['Weekday'], T: ['Saturday', 'Sunday', 'Weekday'] });
  });

  it('the week from the run date (CIV-1011 stage 4) keeps the light rail weekend with no opt-in', async () => {
    const plain = await processAgencyFeeds(await soundTransitZip(), [], { slug: 'st', feedUrl: MAIN_URL });
    expect(daysByRoute(lineFeatures(plain.geojson))).toEqual({ L: ['Saturday', 'Sunday', 'Weekday'], T: ['Saturday', 'Sunday', 'Weekday'] });
  });

  it('gives the light rail Weekday, Saturday and Sunday when the main feed is listed', async () => {
    const optedIn = await processAgencyFeeds(await soundTransitZip(), [], { slug: 'st', feedUrl: MAIN_URL, nextServiceDatesFeedUrls: [MAIN_URL] });
    const props = lineFeatures(optedIn.geojson);
    expect(daysByRoute(props)).toEqual({ L: ['Saturday', 'Sunday', 'Weekday'], T: ['Saturday', 'Sunday', 'Weekday'] });
    for (const p of props.filter(p => p.routeId === 'L')) expect(p.headway).toBe(10);
  });

  it('leaves a line with only long-range services unchanged', async () => {
    const buf = await soundTransitZip();
    const plain = await processAgencyFeeds(buf, [], { slug: 'st', feedUrl: MAIN_URL });
    const optedIn = await processAgencyFeeds(buf, [], { slug: 'st', feedUrl: MAIN_URL, nextServiceDatesFeedUrls: [MAIN_URL] });
    const t = (geojson: string) => lineFeatures(geojson).filter(p => p.routeId === 'T');
    expect(t(optedIn.geojson)).toEqual(t(plain.geojson));
    expect(optedIn.calendarExpiry).toBe(plain.calendarExpiry);
  });

  it('keeps the main feed on the default logic when only a supplemental feed is listed', async () => {
    const buf = await soundTransitZip();
    const plain = await processAgencyFeeds(buf, [], { slug: 'st', feedUrl: MAIN_URL });
    const other = await processAgencyFeeds(buf, [], { slug: 'st', feedUrl: MAIN_URL, nextServiceDatesFeedUrls: ['https://example.test/rail.zip'] });
    expect(other.geojson).toBe(plain.geojson);
    expect(other.stopsJson).toBe(plain.stopsJson);
    expect(other.tripsJson).toBe(plain.tripsJson);
    expect(other.corridorsGeojson).toBe(plain.corridorsGeojson);
  });

  it('does not opt in an agency with no feedUrl', async () => {
    const buf = await soundTransitZip();
    const plain = await processAgencyFeeds(buf, [], { slug: 'st' });
    const noUrl = await processAgencyFeeds(buf, [], { slug: 'st', feedUrl: null, nextServiceDatesFeedUrls: [MAIN_URL] });
    expect(noUrl.geojson).toBe(plain.geojson);
  });
});

// CIV-445: for runs dated Nov 1-7 and Dec 6-12 the typical Sunday in the two-week window was a
// Seahawks game day (Nov 8, Dec 13), so N and S Line gained a Sunday riders don't have. With
// nextServiceDatesSkipWeekendEvents, a Saturday or Sunday service is left out when every route it
// serves runs on at least half of the feed's weekdays and fewer than half of that weekend day.
describe('nextServiceDatesSkipWeekendEvents (Sound Transit Sounder game days, CIV-445)', () => {
  afterEach(() => { vi.useRealTimers(); });
  const st = { slug: 'st', feedUrl: MAIN_URL, nextServiceDatesFeedUrls: [MAIN_URL] };
  const skip = { ...st, nextServiceDatesSkipWeekendEvents: true };
  // The opt-in is read only by the old picker (the kill switch and History backfills, CIV-1101).
  const OLD = { legacyReferenceDate: true };

  it('without the option, a run on Mon Nov 2 reads the game-day Sunday for S (the reported limit)', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-02T08:00:00') });
    const result = await processAgencyFeeds(await soundTransitZip({ sounder: true }), [], st, OLD);
    expect(daysByRoute(lineFeatures(result.geojson)).S).toEqual(['Sunday', 'Weekday']);
  });

  it('with the option, S keeps Weekday only and every other line is unchanged', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-02T08:00:00') });
    const buf = await soundTransitZip({ sounder: true });
    const plain = lineFeatures((await processAgencyFeeds(buf, [], st, OLD)).geojson);
    const skipped = lineFeatures((await processAgencyFeeds(buf, [], skip, OLD)).geojson);
    expect(daysByRoute(skipped).S).toEqual(['Weekday']);
    expect(daysByRoute(skipped).T).toEqual(['Saturday', 'Sunday', 'Weekday']);
    expect(skipped).toEqual(plain.filter(p => !(p.routeId === 'S' && p.day === 'Sunday')));
  });

  it('skips the two-Sunday game-day row too (run Wed Sep 30)', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-30T08:00:00') });
    const buf = await soundTransitZip({ sounder: true });
    expect(daysByRoute(lineFeatures((await processAgencyFeeds(buf, [], st, OLD)).geojson)).S).toEqual(['Sunday', 'Weekday']);
    expect(daysByRoute(lineFeatures((await processAgencyFeeds(buf, [], skip, OLD)).geojson)).S).toEqual(['Weekday']);
  });

  it('keeps a weekend-only shuttle and leaves a week with no game day byte-identical (run Mon Nov 9)', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-09T08:00:00') });
    const buf = await soundTransitZip({ sounder: true });
    const plain = await processAgencyFeeds(buf, [], st, OLD);
    const skipped = await processAgencyFeeds(buf, [], skip, OLD);
    expect(daysByRoute(lineFeatures(skipped.geojson)).X).toEqual(['Saturday', 'Sunday']);
    expect(skipped.geojson).toBe(plain.geojson);
    expect(skipped.stopsJson).toBe(plain.stopsJson);
  });

  it('does nothing for a feed with no occasional weekend service', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: RUN });
    const buf = await soundTransitZip();
    const plain = await processAgencyFeeds(buf, [], st, OLD);
    const skipped = await processAgencyFeeds(buf, [], skip, OLD);
    expect(skipped.geojson).toBe(plain.geojson);
  });
});

// CIV-1101: the live map reads Sound Transit on the one service-day model, where a one-day game
// Sunday loses the week-by-week vote, so no opt-in is needed. The weekend shuttle here runs on 2
// of its 5 weekends, so it loses the vote too and is not drawn (the old opt-in drew it).
describe('Sound Transit game days on the one service-day model (CIV-1101)', () => {
  afterEach(() => { vi.useRealTimers(); });
  const st = { slug: 'st', feedUrl: MAIN_URL, nextServiceDatesFeedUrls: [MAIN_URL], nextServiceDatesSkipWeekendEvents: true };

  for (const run of ['2026-11-02T08:00:00', '2026-11-09T08:00:00']) {
    it(`S keeps Weekday only, L and T keep every day (run ${run.slice(0, 10)})`, async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date(run) });
      const days = daysByRoute(lineFeatures((await processAgencyFeeds(await soundTransitZip({ sounder: true }), [], st)).geojson));
      expect(days.S).toEqual(['Weekday']);
      expect(days.L).toEqual(['Saturday', 'Sunday', 'Weekday']);
      expect(days.T).toEqual(['Saturday', 'Sunday', 'Weekday']);
      expect(days.X).toBeUndefined();
    });
  }
});
