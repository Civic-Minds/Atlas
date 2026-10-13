import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  normalizeNrtAnalysisResult,
  expandFrequencyOffsets,
  hasNightServiceAtShapeEndpoints,
  processGtfsBuffer,
  representativeStopSequence,
  selectTerminalDepartureTimes,
  scopedTerminalHeadline,
  selectPeriodCoverageHeadway,
} from '../process-core';

describe('selectPeriodCoverageHeadway', () => {
  it('follows the terminal when the display selects its median', () => {
    expect(selectPeriodCoverageHeadway(120, 10, 10, 10, true)).toBe(120);
  });

  it('follows the protected branch when its median wins', () => {
    expect(selectPeriodCoverageHeadway(10, 120, 10, 30, false)).toBe(120);
  });

  it('does not borrow service when a scoped terminal period is empty', () => {
    expect(selectPeriodCoverageHeadway(null, 10, 10, 10, true)).toBeNull();
    expect(selectPeriodCoverageHeadway(null, 10, null, 10, true)).toBeNull();
  });

  it('keeps coverage when too few terminal departures exist for any median', () => {
    expect(selectPeriodCoverageHeadway(90, null, null, null, true)).toBe(90);
  });

  it('uses the selected branch when a sparse terminal median falls back to it', () => {
    expect(selectPeriodCoverageHeadway(90, 120, null, 30, true)).toBe(120);
  });
});

describe('normalizeNrtAnalysisResult', () => {
  const result = {
    route: 'night-route',
    day: 'Weekday',
    dir: '0',
    avgHeadway: 30,
    medianHeadway: 30,
    tier: 'span',
    tripCount: 8,
    gaps: [30, 30, 30],
    times: [1080, 1110, 1140, 1170],
    reliabilityScore: 100,
    consistencyScore: 100,
    bunchingPenalty: 0,
    outlierPenalty: 0,
    headwayVariance: 0,
    bunchingFactor: 0,
  };

  it('promotes scheduled evening service using its actual median headway', () => {
    expect(normalizeNrtAnalysisResult(result)).toMatchObject({ tier: '30' });
  });

  it('leaves non-span results unchanged', () => {
    const regular = { ...result, tier: '60' };
    expect(normalizeNrtAnalysisResult(regular)).toBe(regular);
  });
});

describe('expandFrequencyOffsets', () => {
  it('expands a frequency block relative to the representative trip', () => {
    expect(expandFrequencyOffsets(360, 360, 480, 30)).toEqual([0, 30, 60, 90]);
  });

  it('rejects invalid or empty frequency blocks', () => {
    expect(expandFrequencyOffsets(360, 480, 360, 30)).toEqual([]);
    expect(expandFrequencyOffsets(360, 360, 480, 0)).toEqual([]);
  });

  it('keeps a genuine frequency block unchanged when the trip span is known', () => {
    // 06:00-08:00 every 30 min, 45-minute run: four real departures.
    expect(expandFrequencyOffsets(360, 360, 480, 30, 45)).toEqual([0, 30, 60, 90]);
  });

  it('treats a window that is exactly one run of its trip as that single trip (#702)', () => {
    // Coast RTA TL-1854: 08:00-09:00, headway_secs 3496, 60-minute loop.
    expect(expandFrequencyOffsets(480, 480, 540, 3496 / 60, 60)).toEqual([0]);
    // Coast RTA TL-1830 (Rt 7X): 06:00-07:00, headway_secs 1766, 60-minute run.
    expect(expandFrequencyOffsets(360, 360, 420, 1766 / 60, 60)).toEqual([0]);
  });

  it('still expands a long window whose stop_times were stretched to the window', () => {
    // Clemson TL-4257 pattern: 07:00-18:07 every 1213 s, representative trip spans the window.
    const offsets = expandFrequencyOffsets(420, 420, 1087, 1213 / 60, 667);
    expect(offsets).toHaveLength(33);
    expect(offsets[0]).toBe(0);
  });
});

describe('selectTerminalDepartureTimes', () => {
  it('prefers destination-scoped departures when a headsign combines schedule patterns', () => {
    const shapeTimes = [600, 630, 660];
    const headsignTimes = [600, 604, 630, 634, 660];

    expect(selectTerminalDepartureTimes(shapeTimes, headsignTimes)).toBe(headsignTimes);
  });

  it('uses headsign departures when no shape-specific departures exist', () => {
    const headsignTimes = [600, 630, 660];

    expect(selectTerminalDepartureTimes(undefined, headsignTimes)).toBe(headsignTimes);
  });

  it('preserves an empty destination-scoped array instead of borrowing another pattern', () => {
    const empty: number[] = [];
    expect(selectTerminalDepartureTimes(empty, [360, 370, 380])).toEqual([360, 370, 380]);
  });
});

describe('hasNightServiceAtShapeEndpoints', () => {
  it('qualifies an overnight-only route before daytime stop metrics exist', () => {
    const routeDepartures = new Map([
      ['origin', [47, 107, 167, 227, 287, 347]],
      ['terminal', [120, 180]],
    ]);

    expect(hasNightServiceAtShapeEndpoints(['origin', 'terminal'], routeDepartures)).toBe(true);
  });

  it('combines plain and shifted overnight-only departures at an endpoint', () => {
    const routeDepartures = new Map([['origin', [47, 107, 167]]]);
    const overnightOnly = new Map([['origin', [1620, 1680, 1740]]]);

    expect(hasNightServiceAtShapeEndpoints(['origin'], routeDepartures, overnightOnly)).toBe(true);
  });

  it('does not let another route pattern make the rendered pattern qualify', () => {
    const pooledRouteDepartures = new Map([
      ['origin', [1560, 1620, 1680, 1740, 1800]],
    ]);
    const renderedPatternDepartures = new Map([
      ['origin', [1720, 1780]],
    ]);

    expect(hasNightServiceAtShapeEndpoints(['origin'], pooledRouteDepartures)).toBe(true);
    expect(hasNightServiceAtShapeEndpoints(['origin'], renderedPatternDepartures)).toBe(false);
  });
});

describe('processGtfsBuffer mapless routes', () => {
  it('keeps schedule-backed routes searchable when the feed has no shapes', async () => {
    const zip = new JSZip();
    zip.file('agency.txt', 'agency_id,agency_name,agency_url,agency_timezone\na,Mapless Transit,https://example.test,America/Toronto\n');
    zip.file('routes.txt', 'route_id,route_short_name,route_long_name,route_type\nr1,1,Main Street,3\n');
    zip.file('stops.txt', 'stop_id,stop_name,stop_lat,stop_lon\ns1,First Stop,43.65,-79.38\ns2,Last Stop,43.66,-79.37\n');
    zip.file('calendar.txt', 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nweekday,1,1,1,1,1,0,0,20260101,20261231\n');
    zip.file('trips.txt', [
      'route_id,service_id,trip_id,trip_headsign,direction_id',
      'r1,weekday,t1,Downtown,0',
      'r1,weekday,t2,Downtown,0',
      'r1,weekday,t3,Downtown,0',
      'r1,weekday,t4,Downtown,0',
      'r1,weekday,t5,Downtown,0',
      'r1,weekday,t6,Downtown,0',
    ].join('\n') + '\n');
    zip.file('stop_times.txt', [
      'trip_id,arrival_time,departure_time,stop_id,stop_sequence',
      't1,08:00:00,08:00:00,s1,1', 't1,08:15:00,08:15:00,s2,2',
      't2,08:30:00,08:30:00,s1,1', 't2,08:45:00,08:45:00,s2,2',
      't3,09:00:00,09:00:00,s1,1', 't3,09:15:00,09:15:00,s2,2',
      't4,09:30:00,09:30:00,s1,1', 't4,09:45:00,09:45:00,s2,2',
      't5,10:00:00,10:00:00,s1,1', 't5,10:15:00,10:15:00,s2,2',
      't6,10:30:00,10:30:00,s1,1', 't6,10:45:00,10:45:00,s2,2',
    ].join('\n') + '\n');

    const result = await processGtfsBuffer(await zip.generateAsync({ type: 'nodebuffer' }), undefined, { slug: 'mapless-transit' });
    const route = JSON.parse(result.geojson).features.find((feature: any) => feature.properties.routeShortName === '1');

    expect(route.geometry).toEqual({ type: 'Point', coordinates: [-79.38, 43.65] });
    expect(route.properties.noRouteShape).toBe(true);
    expect(route.properties.routeShortName).toBe('1');
    expect(route.properties.headway).toBe(30);
    expect(route.properties.headwayByPeriod.midday).toBe(30);
    expect(result.feedQuality.status).not.toBe('unusable');
    expect(result.center).toEqual([43.65, -79.38]);
  });
});

function maplessFixtureZip(options: { shapedFirst: boolean }): JSZip {
  // Two route IDs share short name "1". r-shaped has a shape but runs hourly; r-mapless has no
  // shape and runs every 15 minutes, so it would win the slot on frequency alone.
  const zip = new JSZip();
  zip.file('agency.txt', 'agency_id,agency_name,agency_url,agency_timezone\na,Mixed Transit,https://example.test,America/Toronto\n');
  const routeRows = ['r-shaped,1,Main Street,3', 'r-mapless,1,Main Street,3'];
  if (!options.shapedFirst) routeRows.reverse();
  zip.file('routes.txt', ['route_id,route_short_name,route_long_name,route_type', ...routeRows].join('\n') + '\n');
  zip.file('stops.txt', 'stop_id,stop_name,stop_lat,stop_lon\ns1,First Stop,43.65,-79.38\ns2,Last Stop,43.66,-79.37\n');
  zip.file('calendar.txt', 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nweekday,1,1,1,1,1,0,0,20260101,20261231\n');
  zip.file('shapes.txt', [
    'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence',
    'sh1,43.65,-79.38,1',
    'sh1,43.655,-79.375,2',
    'sh1,43.66,-79.37,3',
  ].join('\n') + '\n');
  const trips = ['route_id,service_id,trip_id,trip_headsign,direction_id,shape_id'];
  const stopTimes = ['trip_id,arrival_time,departure_time,stop_id,stop_sequence'];
  const shapedTrips: string[] = [];
  const maplessTrips: string[] = [];
  for (let start = 7 * 60; start <= 19 * 60; start += 60) {
    const id = `s${start}`;
    shapedTrips.push(`r-shaped,weekday,${id},Downtown,0,sh1`);
    stopTimes.push(`${id},${hm(start)},${hm(start)},s1,1`, `${id},${hm(start + 10)},${hm(start + 10)},s2,2`);
  }
  for (let start = 7 * 60; start <= 19 * 60; start += 15) {
    const id = `m${start}`;
    maplessTrips.push(`r-mapless,weekday,${id},Downtown,0,`);
    stopTimes.push(`${id},${hm(start + 2)},${hm(start + 2)},s1,1`, `${id},${hm(start + 12)},${hm(start + 12)},s2,2`);
  }
  trips.push(...(options.shapedFirst ? [...shapedTrips, ...maplessTrips] : [...maplessTrips, ...shapedTrips]));
  zip.file('trips.txt', trips.join('\n') + '\n');
  zip.file('stop_times.txt', stopTimes.join('\n') + '\n');
  return zip;
}

function hm(mins: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}:00`;
}

describe('processGtfsBuffer shaped vs mapless slot', () => {
  for (const shapedFirst of [true, false]) {
    it(`keeps the drawn line when a more frequent mapless route shares the slot (shaped ${shapedFirst ? 'first' : 'second'})`, async () => {
      const zip = maplessFixtureZip({ shapedFirst });
      const result = await processGtfsBuffer(await zip.generateAsync({ type: 'nodebuffer' }), undefined, { slug: 'mixed-transit' });
      const routeFeatures = JSON.parse(result.geojson).features
        .filter((feature: any) => feature.properties.routeShortName === '1' && feature.properties.day === 'Weekday' && feature.properties.directionId === 0);
      expect(routeFeatures.length).toBeGreaterThan(0);
      for (const feature of routeFeatures) {
        expect(feature.geometry.type).toBe('LineString');
        expect(feature.properties.noRouteShape).toBe(false);
        expect(feature.properties.routeId).toBe('r-shaped');
      }
    });
  }
});

describe('representativeStopSequence', () => {
  const stopTimes = new Map([
    ['short', [{ stop_id: 'b', stop_sequence: '2' }, { stop_id: 'a', stop_sequence: '1' }]],
    ['long', [
      { stop_id: 'c', stop_sequence: '30' },
      { stop_id: 'a', stop_sequence: '5' },
      { stop_id: 'b', stop_sequence: '10' },
      { stop_id: 'ghost', stop_sequence: '20' },
      { stop_id: 'a', stop_sequence: '40' },
    ]],
  ]);
  const known = (id: string) => id !== 'ghost';

  it('uses numeric stop_sequence order, not row order', () => {
    expect(representativeStopSequence([{ trip_id: 'short' }], stopTimes, known)).toEqual(['a', 'b']);
  });

  it('picks the trip serving the most stops, drops unknown stops, and keeps a loop terminal once', () => {
    expect(representativeStopSequence([{ trip_id: 'short' }, { trip_id: 'long' }], stopTimes, known)).toEqual(['a', 'b', 'c']);
  });

  it('returns an empty sequence when no candidate trip has stop times', () => {
    expect(representativeStopSequence([{ trip_id: 'missing' }], stopTimes, known)).toEqual([]);
  });
});

describe('processGtfsBuffer mapless stop order', () => {
  it('places a mapless route at its first stop by stop_sequence, not by file order', async () => {
    const zip = new JSZip();
    zip.file('agency.txt', 'agency_id,agency_name,agency_url,agency_timezone\na,Mapless Transit,https://example.test,America/Toronto\n');
    zip.file('routes.txt', 'route_id,route_short_name,route_long_name,route_type\nr1,1,Main Street,3\n');
    // The terminal (s3) is listed first in stops.txt and its stop_times rows come first.
    zip.file('stops.txt', 'stop_id,stop_name,stop_lat,stop_lon\ns3,Last Stop,43.67,-79.36\ns1,First Stop,43.65,-79.38\ns2,Middle Stop,43.66,-79.37\n');
    zip.file('calendar.txt', 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nweekday,1,1,1,1,1,0,0,20260101,20261231\n');
    const trips = ['route_id,service_id,trip_id,trip_headsign,direction_id'];
    const stopTimes = ['trip_id,arrival_time,departure_time,stop_id,stop_sequence'];
    for (let start = 7 * 60; start <= 19 * 60; start += 20) {
      const id = `t${start}`;
      trips.push(`r1,weekday,${id},Downtown,0`);
      stopTimes.push(
        `${id},${hm(start + 20)},${hm(start + 20)},s3,30`,
        `${id},${hm(start)},${hm(start)},s1,10`,
        `${id},${hm(start + 10)},${hm(start + 10)},s2,20`,
      );
    }
    zip.file('trips.txt', trips.join('\n') + '\n');
    zip.file('stop_times.txt', stopTimes.join('\n') + '\n');

    const result = await processGtfsBuffer(await zip.generateAsync({ type: 'nodebuffer' }), undefined, { slug: 'mapless-transit' });
    const route = JSON.parse(result.geojson).features
      .find((feature: any) => feature.properties.routeShortName === '1' && feature.properties.day === 'Weekday');

    expect(route.geometry).toEqual({ type: 'Point', coordinates: [-79.38, 43.65] });
  });
});

describe('processGtfsBuffer stop data', () => {
  it('keeps per-stop headways, stop order, and the stops index for weekday service', async () => {
    const zip = new JSZip();
    zip.file('agency.txt', 'agency_id,agency_name,agency_url,agency_timezone\na,Stop Transit,https://example.test,America/Toronto\n');
    zip.file('routes.txt', 'route_id,route_short_name,route_long_name,route_type\nr1,1,Main Street,3\n');
    zip.file('stops.txt', 'stop_id,stop_name,stop_lat,stop_lon\ns1,First Stop,43.65,-79.38\ns2,Middle Stop,43.655,-79.375\ns3,Last Stop,43.66,-79.37\n');
    zip.file('calendar.txt', 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nweekday,1,1,1,1,1,0,0,20260101,20261231\n');
    zip.file('shapes.txt', [
      'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence',
      'sh1,43.65,-79.38,1',
      'sh1,43.655,-79.375,2',
      'sh1,43.66,-79.37,3',
    ].join('\n') + '\n');
    const trips = ['route_id,service_id,trip_id,trip_headsign,direction_id,shape_id'];
    const stopTimes = ['trip_id,arrival_time,departure_time,stop_id,stop_sequence'];
    for (let start = 6 * 60; start <= 22 * 60; start += 10) {
      const id = `t${start}`;
      trips.push(`r1,weekday,${id},Downtown,0,sh1`);
      stopTimes.push(
        `${id},${hm(start)},${hm(start)},s1,1`,
        `${id},${hm(start + 5)},${hm(start + 5)},s2,2`,
        `${id},${hm(start + 10)},${hm(start + 10)},s3,3`,
      );
    }
    zip.file('trips.txt', trips.join('\n') + '\n');
    zip.file('stop_times.txt', stopTimes.join('\n') + '\n');

    const result = await processGtfsBuffer(await zip.generateAsync({ type: 'nodebuffer' }), undefined, { slug: 'stop-transit' });
    const route = JSON.parse(result.geojson).features
      .find((feature: any) => feature.properties.routeShortName === '1' && feature.properties.day === 'Weekday');

    expect(route.properties.stopOrder).toEqual(['s1', 's2', 's3']);
    expect(Object.keys(route.properties.stopHeadways ?? {})).toEqual(expect.arrayContaining(['s1', 's2', 's3']));
    expect(Object.keys(JSON.parse(result.stopsJson))).toEqual(expect.arrayContaining(['s1', 's2', 's3']));
  });
});

function frequencyFixtureZip(): JSZip {
  const zip = new JSZip();
  zip.file('agency.txt', 'agency_id,agency_name,agency_url,agency_timezone\na,Frequency Transit,https://example.test,America/New_York\n');
  zip.file('routes.txt', [
    'route_id,route_short_name,route_long_name,route_type',
    'r10,10,Hourly Loop,3',
    'r7x,7X,Express,3',
    'r7p,7P,Express Timetable,3',
    'r27,27,All Day Shuttle,3',
    'r1,1,Frequent Line,3',
  ].join('\n') + '\n');
  zip.file('stops.txt', [
    'stop_id,stop_name,stop_lat,stop_lon',
    'a1,Loop Start,33.70,-78.90', 'a2,Loop Middle,33.71,-78.89', 'a3,Loop End,33.72,-78.88',
    'x1,Express Start,33.60,-79.00', 'x2,Express End,33.65,-78.95',
    'p1,Timetable Start,33.40,-79.20', 'p2,Timetable End,33.45,-79.15',
    'c1,Shuttle Start,33.80,-78.80', 'c2,Shuttle End,33.81,-78.79',
    'f1,Line Start,33.50,-79.10', 'f2,Line Middle,33.51,-79.09', 'f3,Line End,33.52,-79.08',
  ].join('\n') + '\n');
  zip.file('calendar.txt', 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nweekday,1,1,1,1,1,0,0,20260101,20261231\n');
  zip.file('shapes.txt', [
    'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence',
    'sh10,33.70,-78.90,1', 'sh10,33.71,-78.89,2', 'sh10,33.72,-78.88,3',
    'sh7x,33.60,-79.00,1', 'sh7x,33.65,-78.95,2',
    'sh7p,33.40,-79.20,1', 'sh7p,33.45,-79.15,2',
    'sh27,33.80,-78.80,1', 'sh27,33.81,-78.79,2',
    'sh1,33.50,-79.10,1', 'sh1,33.51,-79.09,2', 'sh1,33.52,-79.08,3',
  ].join('\n') + '\n');
  const trips = ['route_id,service_id,trip_id,trip_headsign,direction_id,shape_id'];
  const stopTimes = ['trip_id,arrival_time,departure_time,stop_id,stop_sequence'];
  const frequencies = ['trip_id,start_time,end_time,headway_secs'];

  // Coast RTA Rt 10 pattern (#702): one frequencies.txt window per scheduled trip, each window
  // exactly the trip's 60-minute run, headway_secs just under the window. Hourly, 12 per day.
  for (let start = 8 * 60; start <= 19 * 60; start += 60) {
    const id = `loop${start}`;
    trips.push(`r10,weekday,${id},Loop,0,sh10`);
    stopTimes.push(`${id},${hm(start)},${hm(start)},a1,1`, `${id},${hm(start + 30)},${hm(start + 30)},a2,2`, `${id},${hm(start + 60)},${hm(start + 60)},a3,3`);
    frequencies.push(`${id},${hm(start)},${hm(start + 60)},3496`);
  }

  // Coast RTA Rt 7X pattern: four trips a day, each its own window with headway_secs well
  // under the window. Only the four scheduled trips run.
  for (const [start, run] of [[360, 60], [375, 45], [795, 45], [870, 40]]) {
    const id = `express${start}`;
    trips.push(`r7x,weekday,${id},Express,0,sh7x`);
    stopTimes.push(`${id},${hm(start)},${hm(start)},x1,1`, `${id},${hm(start + run)},${hm(start + run)},x2,2`);
    frequencies.push(`${id},${hm(start)},${hm(start + run)},1766`);
  }
  // The same four trips as an ordinary stop_times timetable, for comparison.
  for (const [start, run] of [[360, 60], [375, 45], [795, 45], [870, 40]]) {
    const id = `timetable${start}`;
    trips.push(`r7p,weekday,${id},Express Timetable,0,sh7p`);
    stopTimes.push(`${id},${hm(start)},${hm(start)},p1,1`, `${id},${hm(start + run)},${hm(start + run)},p2,2`);
  }

  // Clemson-style genuine all-day block: one row, stop_times stretched across the whole
  // window, a real 20-minute headway.
  trips.push('r27,weekday,shuttle,Shuttle,0,sh27');
  stopTimes.push(`shuttle,${hm(7 * 60)},${hm(7 * 60)},c1,1`, `shuttle,${hm(19 * 60)},${hm(19 * 60)},c2,2`);
  frequencies.push(`shuttle,${hm(7 * 60)},${hm(19 * 60)},1200`);

  // Conventional frequency-based line (the case 4a744ce1 fixed): one representative 30-minute
  // trip, every 10 minutes 06:00-22:00.
  trips.push('r1,weekday,line,Line,0,sh1');
  stopTimes.push(`line,${hm(360)},${hm(360)},f1,1`, `line,${hm(375)},${hm(375)},f2,2`, `line,${hm(390)},${hm(390)},f3,3`);
  frequencies.push(`line,${hm(6 * 60)},${hm(22 * 60)},600`);

  zip.file('trips.txt', trips.join('\n') + '\n');
  zip.file('stop_times.txt', stopTimes.join('\n') + '\n');
  zip.file('frequencies.txt', frequencies.join('\n') + '\n');
  return zip;
}

describe('processGtfsBuffer frequencies.txt expansion', () => {
  async function weekdayRoutes() {
    const zip = frequencyFixtureZip();
    const result = await processGtfsBuffer(await zip.generateAsync({ type: 'nodebuffer' }), undefined, { slug: 'frequency-transit' });
    const features = JSON.parse(result.geojson).features.filter((feature: any) => feature.properties.day === 'Weekday');
    return (shortName: string) => features.find((feature: any) => feature.properties.routeShortName === shortName).properties;
  }

  it('keeps one-trip-per-window feeds at their scheduled hourly headway (#702)', async () => {
    const route = await weekdayRoutes();
    const loop = route('10');
    expect(loop.headway).toBe(60);
    expect(loop.tier).toBe('60');
    expect(Object.values(loop.stopHeadways ?? {}).every(hw => hw === 60)).toBe(true);
  });

  it('classifies a four-trip express exactly like the same four trips without frequencies.txt (#702, #706)', async () => {
    // This express used to come out infrequent only because route-level expansion still
    // invented a second departure in each window. Its real service is four trips, two of them
    // before 07:00, which the classifier treats the same as any other two-trip daytime route.
    const route = await weekdayRoutes();
    const express = route('7X');
    const plain = route('7P');
    expect(express.tier).toBe(plain.tier);
    expect(express.headway).toBe(plain.headway);
    expect(express.headwayByPeriod).toEqual(plain.headwayByPeriod);
    expect(Object.values(express.stopHeadways ?? {})).toEqual(Object.values(plain.stopHeadways ?? {}));
  });

  it('still expands genuine frequency windows, including stretched all-day blocks', async () => {
    const route = await weekdayRoutes();
    const shuttle = route('27');
    expect(shuttle.headway).toBe(20);
    expect(shuttle.stopHeadways?.c1).toBe(20);
    const line = route('1');
    expect(line.headway).toBe(10);
    expect(line.tier).toBe('10');
    expect(line.stopHeadways).toMatchObject({ f1: 10, f2: 10, f3: 10 });
  });
});

// CIV-103 / #476: direct regression tests for terminal-headway resolution and corridor clipping.

describe('scopedTerminalHeadline', () => {
  const every = (step: number, from = 360, to = 1320) => {
    const out: number[] = [];
    for (let t = from; t <= to; t += step) out.push(t);
    return out;
  };

  it('reads the sustained headway of a daytime-serving terminal sample', () => {
    const result = scopedTerminalHeadline(every(20), 'Weekday', '3', false);
    expect(result?.headway).toBe(20);
    expect(result?.tier).not.toBeNull();
  });

  it('returns null for a night-only sample so early trips never become the headline', () => {
    expect(scopedTerminalHeadline([60, 90, 120, 150, 180, 210], 'Weekday', '3', false)).toBeNull();
    expect(scopedTerminalHeadline(undefined, 'Weekday', '3', false)).toBeNull();
  });

  it('returns null for a short burst that is not all-day service', () => {
    // Four PM short turns minutes apart: daytime exists but it is a burst, not a headline.
    expect(scopedTerminalHeadline([1000, 1004, 1008, 1012], 'Weekday', '3', false)).toBeNull();
  });

  it('returns null with fewer than four distinct daytime departures', () => {
    expect(scopedTerminalHeadline([600, 660, 720], 'Weekday', '3', false)).toBeNull();
  });

  it('gives a headline but no tier for rail, which phase 2 grades on its own window', () => {
    const result = scopedTerminalHeadline(every(30), 'Weekday', '2', true);
    expect(result?.headway).toBe(30);
    expect(result?.tier).toBeNull();
  });

  it('does not depend on input order', () => {
    const times = every(20);
    expect(scopedTerminalHeadline([...times].reverse(), 'Weekday', '3', false))
      .toEqual(scopedTerminalHeadline(times, 'Weekday', '3', false));
  });
});

describe('processGtfsBuffer terminal headway', () => {
  // One route, one direction. Stops s1..s3; only 'Downtown' trips reach s3. 'Short' trips
  // (every 60 min) turn at s2, so s2 sees a denser mix than the terminal s3.
  async function weekdayFeature(downtownStep: number) {
    const zip = new JSZip();
    zip.file('agency.txt', 'agency_id,agency_name,agency_url,agency_timezone\na,Term Transit,https://example.test,America/Toronto\n');
    zip.file('routes.txt', 'route_id,route_short_name,route_long_name,route_type\nr1,1,Main,3\n');
    zip.file('stops.txt', 'stop_id,stop_name,stop_lat,stop_lon\ns1,One,43.65,-79.38\ns2,Two,43.655,-79.375\ns3,Three,43.66,-79.37\n');
    zip.file('calendar.txt', 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nweekday,1,1,1,1,1,0,0,20260101,20261231\n');
    zip.file('shapes.txt', [
      'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence',
      'sh1,43.65,-79.38,1', 'sh1,43.655,-79.375,2', 'sh1,43.66,-79.37,3',
    ].join('\n') + '\n');
    const trips = ['route_id,service_id,trip_id,trip_headsign,direction_id,shape_id'];
    const stopTimes = ['trip_id,arrival_time,departure_time,stop_id,stop_sequence'];
    for (let start = 360; start <= 1320; start += downtownStep) {
      const id = `t${start}`;
      trips.push(`r1,weekday,${id},Downtown,0,sh1`);
      stopTimes.push(`${id},${hm(start)},${hm(start)},s1,1`, `${id},${hm(start + 5)},${hm(start + 5)},s2,2`, `${id},${hm(start + 10)},${hm(start + 10)},s3,3`);
    }
    zip.file('trips.txt', trips.join('\n') + '\n');
    zip.file('stop_times.txt', stopTimes.join('\n') + '\n');
    const result = await processGtfsBuffer(await zip.generateAsync({ type: 'nodebuffer' }), undefined, { slug: 'term-transit' });
    return JSON.parse(result.geojson).features
      .find((f: any) => f.properties.routeShortName === '1' && f.properties.day === 'Weekday' && f.geometry.type === 'LineString');
  }

  it('reports the terminal headway, not a stale or default value', async () => {
    const feature = await weekdayFeature(15);
    expect(feature.properties.headway).toBe(15);
    expect(feature.properties.tier).toBeDefined();
  });

  it('tracks the real headway when service is sparser', async () => {
    const feature = await weekdayFeature(30);
    expect(feature.properties.headway).toBe(30);
  });
});

describe('processGtfsBuffer corridor clipping', () => {
  // Two routes share the consecutive links s1->s2->s3. The shape has long tails before s1 and
  // after s3 that the corridor must not include.
  async function corridorFixture(withShapes: boolean) {
    const zip = new JSZip();
    zip.file('agency.txt', 'agency_id,agency_name,agency_url,agency_timezone\na,Corridor Transit,https://example.test,America/Toronto\n');
    zip.file('routes.txt', 'route_id,route_short_name,route_long_name,route_type\nr1,1,One,3\nr2,2,Two,3\n');
    zip.file('stops.txt', 'stop_id,stop_name,stop_lat,stop_lon\ns1,One,43.650,-79.380\ns2,Two,43.655,-79.375\ns3,Three,43.660,-79.370\n');
    zip.file('calendar.txt', 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nweekday,1,1,1,1,1,0,0,20260101,20261231\n');
    if (withShapes) {
      zip.file('shapes.txt', [
        'shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence',
        'sh1,43.640,-79.390,1', 'sh1,43.645,-79.385,2', 'sh1,43.650,-79.380,3', 'sh1,43.655,-79.375,4',
        'sh1,43.660,-79.370,5', 'sh1,43.665,-79.365,6', 'sh1,43.670,-79.360,7',
      ].join('\n') + '\n');
    }
    const trips = ['route_id,service_id,trip_id,trip_headsign,direction_id,shape_id'];
    const stopTimes = ['trip_id,arrival_time,departure_time,stop_id,stop_sequence'];
    for (const route of ['r1', 'r2']) {
      // r2 runs 10 minutes after r1, so the combined corridor headway is 10.
      for (let start = route === 'r1' ? 360 : 370; start <= 1200; start += 20) {
        const id = `${route}t${start}`;
        trips.push(`${route},weekday,${id},Downtown,0,${withShapes ? 'sh1' : ''}`);
        stopTimes.push(
          `${id},${hm(start)},${hm(start)},s1,1`,
          `${id},${hm(start + 5)},${hm(start + 5)},s2,2`,
          `${id},${hm(start + 10)},${hm(start + 10)},s3,3`,
        );
      }
    }
    zip.file('trips.txt', trips.join('\n') + '\n');
    zip.file('stop_times.txt', stopTimes.join('\n') + '\n');
    const result = await processGtfsBuffer(await zip.generateAsync({ type: 'nodebuffer' }), undefined, { slug: 'corridor-transit' });
    return JSON.parse(result.corridorsGeojson).features as any[];
  }

  it('clips each corridor to the shape between its two stops, dropping the tails', async () => {
    const corridors = (await corridorFixture(true)).filter(f => f.properties.day === 'Weekday');
    expect(corridors.map(f => f.properties.corridorId).sort()).toEqual(['s1->s2', 's2->s3']);
    const byId = Object.fromEntries(corridors.map(f => [f.properties.corridorId, f.geometry.coordinates]));
    // [lon, lat]; the shape's tail points (43.640-43.645 and 43.665-43.670) must be gone.
    expect(byId['s1->s2'][0][0]).toBeCloseTo(-79.380, 4);
    expect(byId['s1->s2'][0][1]).toBeCloseTo(43.650, 4);
    expect(byId['s1->s2'][byId['s1->s2'].length - 1][0]).toBeCloseTo(-79.375, 4);
    expect(byId['s1->s2'][byId['s1->s2'].length - 1][1]).toBeCloseTo(43.655, 4);
    expect(byId['s2->s3'][0][0]).toBeCloseTo(-79.375, 4);
    expect(byId['s2->s3'][0][1]).toBeCloseTo(43.655, 4);
    expect(byId['s2->s3'][byId['s2->s3'].length - 1][0]).toBeCloseTo(-79.370, 4);
    expect(byId['s2->s3'][byId['s2->s3'].length - 1][1]).toBeCloseTo(43.660, 4);
    for (const coords of Object.values(byId) as number[][][]) {
      for (const [, lat] of coords) {
        expect(lat).toBeGreaterThan(43.6499);
        expect(lat).toBeLessThan(43.6601);
      }
    }
    expect(corridors[0].properties.routeIds.sort()).toEqual(['r1', 'r2']);
    expect(corridors[0].properties.headway).toBe(10);
  });

  it('omits corridors when no shaped route covers the link rather than drawing a straight line', async () => {
    expect(await corridorFixture(false)).toEqual([]);
  });
});
