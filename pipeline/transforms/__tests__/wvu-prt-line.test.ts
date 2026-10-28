import { describe, expect, it } from 'vitest';
import { mergeWvuPrtLine } from '../wvu-prt-line.js';
import type { GtfsData } from '../../../types/gtfs.js';

// #1119: the feed lists every station pair as a route; the merge keeps one line through all five stations.
const names = ['HSC', 'Towers', 'Engineering', 'Beechurst', 'Walnut'];
const code: Record<string, string> = { HSC: 'HSC', Towers: 'TOW', Engineering: 'ENG', Beechurst: 'BEE', Walnut: 'WAL' };
const at: Record<string, [number, number]> = { WAL: [39.6300, -79.9572], BEE: [39.6350, -79.9562], ENG: [39.6472, -79.9731], TOW: [39.6475, -79.9692], HSC: [39.6548, -79.9603] };

function feed(opts: { gap?: boolean } = {}): GtfsData {
  const stops = names.map((name, i) => ({ stop_id: String(i + 1), stop_name: name, stop_lat: '0', stop_lon: '0' }));
  const idOf = (c: string) => String(names.findIndex(n => code[n] === c) + 1);
  const pairs: Array<[string, string]> = [];
  for (const a of Object.values(code)) for (const b of Object.values(code)) if (a !== b) pairs.push([a, b]);
  const shapes = pairs.map(([a, b]) => ({ id: `${a}-${b}`, points: [at[a], opts.gap && a === 'ENG' && b === 'TOW' ? [39.70, -79.90] as [number, number] : at[b]] as [number, number][] }));
  const routes = pairs.map(([a, b], i) => ({ route_id: String(i + 1), agency_id: 'WVUPRT', route_short_name: `${a}-${b}`, route_type: '0' }));
  const trips = pairs.map(([a, b], i) => ({ route_id: String(i + 1), service_id: 'mtwhfs', trip_id: `t${i}` }));
  const stopTimes = pairs.flatMap(([a, b], i) => [
    { trip_id: `t${i}`, arrival_time: '6:30:00', departure_time: '6:30:00', stop_id: idOf(a), stop_sequence: '1' },
    { trip_id: `t${i}`, arrival_time: '6:45:00', departure_time: '6:45:00', stop_id: idOf(b), stop_sequence: '2' },
  ]);
  return { agencies: [], routes, trips, stops, stopTimes, calendar: [], calendarDates: [], shapes };
}

describe('WVU PRT folds into one line (#1119)', () => {
  it('one route, a trip each way through all five stations in line order, on the joined station shapes', () => {
    const { gtfs, merged } = mergeWvuPrtLine(feed());
    expect(merged).toBe(true);
    expect(gtfs.routes.map(r => r.route_short_name)).toEqual(['PRT']);
    expect(gtfs.trips.map(t => [t.direction_id, t.trip_headsign, t.shape_id]).sort()).toEqual([['0', 'HSC', 'PRT-0'], ['1', 'Walnut', 'PRT-1']]);
    const outbound = gtfs.stopTimes.filter(st => st.trip_id === gtfs.trips.find(t => t.direction_id === '0')!.trip_id).map(st => names[Number(st.stop_id) - 1]);
    expect(outbound).toEqual(['Walnut', 'Beechurst', 'Engineering', 'Towers', 'HSC']);
    expect(gtfs.shapes.map(s => s.points.length)).toEqual([5, 5]);
  });

  it('leaves the feed as published when two station shapes do not meet', () => {
    const input = feed({ gap: true });
    const result = mergeWvuPrtLine(input);
    expect(result.merged).toBe(false);
    expect(result.gtfs).toBe(input);
  });
});
