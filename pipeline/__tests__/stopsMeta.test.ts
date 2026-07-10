import { describe, it, expect } from 'vitest';
import { buildStopsMeta, headsignDirection, nameSuffixDirection } from '../stopsMeta.js';
import type { GtfsData } from '../../types/gtfs.js';

function feed(partial: Partial<GtfsData>): GtfsData {
  return {
    agencies: [], routes: [], trips: [], stops: [], stopTimes: [],
    calendar: [], calendarDates: [], shapes: [],
    ...partial,
  } as GtfsData;
}

const stop = (id: string, name: string, code = id) => ({
  stop_id: id, stop_code: code, stop_name: name, stop_lat: '43.65', stop_lon: '-79.38',
});
const st = (trip_id: string, stop_id: string) => ({
  trip_id, stop_id, arrival_time: '08:00:00', departure_time: '08:00:00', stop_sequence: '1',
});

describe('headsignDirection', () => {
  it('parses TTC-style prefixes', () => {
    expect(headsignDirection('East - 10 Van Horne towards Victoria Park')).toBe('Eastbound');
    expect(headsignDirection('North - 510 Spadina')).toBe('Northbound');
  });
  it('parses Xbound and NB/SB/EB/WB forms', () => {
    expect(headsignDirection('Northbound to Finch Station')).toBe('Northbound');
    expect(headsignDirection('WB via King')).toBe('Westbound');
  });
  it('returns null for destination-only headsigns', () => {
    expect(headsignDirection('Finch Station')).toBeNull();
    expect(headsignDirection(undefined)).toBeNull();
  });
});

describe('nameSuffixDirection', () => {
  it('parses side-of-street suffixes', () => {
    expect(nameSuffixDirection('Spadina Ave at Dundas St West South Side')).toBe('Southbound');
    expect(nameSuffixDirection('Spadina Ave at Nassau St')).toBeNull();
  });
});

describe('buildStopsMeta', () => {
  it('derives routes and direction per stop from stop_times joins', () => {
    const gtfs = feed({
      routes: [
        { route_id: 'r510', route_short_name: '510', route_type: '0' },
        { route_id: 'r505', route_short_name: '505', route_type: '0' },
      ],
      trips: [
        { route_id: 'r510', service_id: 's', trip_id: 't1', trip_headsign: 'North - 510 Spadina' },
        { route_id: 'r510', service_id: 's', trip_id: 't2', trip_headsign: 'North - 510 Spadina' },
        { route_id: 'r505', service_id: 's', trip_id: 't3', trip_headsign: 'West - 505 Dundas' },
      ],
      stops: [stop('A', 'Spadina Ave at Dundas St West North Side'), stop('B', 'Dundas St West at Spadina Ave')],
      stopTimes: [st('t1', 'A'), st('t2', 'A'), st('t3', 'B')],
    });
    const meta = buildStopsMeta(gtfs);
    const a = meta.stops.find(s => s.id === 'A')!;
    expect(a.routes).toEqual(['510']);
    expect(a.direction).toBe('Northbound');
    const b = meta.stops.find(s => s.id === 'B')!;
    expect(b.routes).toEqual(['505']);
    expect(b.direction).toBe('Westbound');
  });

  it('omits direction below 90% agreement', () => {
    const gtfs = feed({
      routes: [{ route_id: 'r', route_short_name: '29', route_type: '3' }],
      trips: [
        { route_id: 'r', service_id: 's', trip_id: 'n1', trip_headsign: 'North - 29' },
        { route_id: 'r', service_id: 's', trip_id: 'n2', trip_headsign: 'North - 29' },
        { route_id: 'r', service_id: 's', trip_id: 'e1', trip_headsign: 'East - 29' },
      ],
      stops: [stop('C', 'Dufferin Gate Loop')],
      stopTimes: [st('n1', 'C'), st('n2', 'C'), st('e1', 'C')],
    });
    const c = buildStopsMeta(gtfs).stops.find(s => s.id === 'C')!;
    expect(c.direction).toBeUndefined();
    expect(c.routes).toEqual(['29']);
  });

  it('name suffix vetoes a contradicting headsign majority', () => {
    const gtfs = feed({
      routes: [{ route_id: 'r', route_short_name: '6', route_type: '3' }],
      trips: [{ route_id: 'r', service_id: 's', trip_id: 't', trip_headsign: 'South - 6 Bay' }],
      stops: [stop('D', 'Bay St at Queens Quay North Side')],
      stopTimes: [st('t', 'D')],
    });
    expect(buildStopsMeta(gtfs).stops.find(s => s.id === 'D')!.direction).toBeUndefined();
  });

  it('falls back to name suffix when headsigns carry no direction', () => {
    const gtfs = feed({
      routes: [{ route_id: 'r', route_short_name: '7', route_type: '3' }],
      trips: [{ route_id: 'r', service_id: 's', trip_id: 't', trip_headsign: 'Finch Station' }],
      stops: [stop('E', 'Bathurst St at Steeles Ave East Side')],
      stopTimes: [st('t', 'E')],
    });
    expect(buildStopsMeta(gtfs).stops.find(s => s.id === 'E')!.direction).toBe('Eastbound');
  });

  it('exports official names verbatim and skips unserved stops', () => {
    const gtfs = feed({
      routes: [{ route_id: 'r', route_short_name: '1', route_type: '1' }],
      trips: [{ route_id: 'r', service_id: 's', trip_id: 't' }],
      stops: [stop('F', '  Weird   Official-Name (Platform 2)'), stop('G', 'Never Served')],
      stopTimes: [st('t', 'F')],
    });
    const meta = buildStopsMeta(gtfs);
    expect(meta.stops.map(s => s.id)).toEqual(['F']);
    expect(meta.stops[0].name).toBe('  Weird   Official-Name (Platform 2)');
    expect(meta.stopCount).toBe(1);
  });
});
