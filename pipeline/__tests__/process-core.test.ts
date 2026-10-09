import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  normalizeNrtAnalysisResult,
  expandFrequencyOffsets,
  hasNightServiceAtShapeEndpoints,
  processGtfsBuffer,
  selectTerminalDepartureTimes,
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
