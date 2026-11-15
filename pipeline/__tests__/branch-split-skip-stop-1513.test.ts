import { describe, expect, it } from 'vitest';
import { directionStretches, stretchFilterValue, stretchPeriods, type DirectionTrip } from '../tripSets';

// #1513: SEPTA Regional Rail LAN inbound (Doylestown - Lansdale - Center City), cut down from the Sept 2026
// archived feed and the Nov 2026 feed. Doylestown trains run hourly all day over the whole line; six
// Lansdale short turns (three in each rush hour) run the trunk only. The two feeds differ in one trip: the
// 16:16 short turn stops everywhere in Sept 2026, while Nov 2026's 16:18 skips two stops. As its own stop
// sequence it left the Lansdale pattern two PM trips, not steady, so the line read as one undivided stretch
// (33) instead of a trunk with the hourly Doylestown branch (60).
const doylestown = Array.from({ length: 8 }, (_, i) => `d${i}`);
const trunk = Array.from({ length: 17 }, (_, i) => `t${i}`);
const coords = new Map<string, [number, number]>();
// About 1.5 km between stops (0.009 degrees of latitude is about 1 km).
[...doylestown, ...trunk].forEach((id, i) => coords.set(id, [40.3 - i * 0.0135, -75.2]));
coords.set('x', [39.95, -75.18]);
const coord = (id: string) => coords.get(id);

const hm = (t: string) => Number(t.split(':')[0]) * 60 + Number(t.split(':')[1]);
const trip = (id: string, start: string, stops: readonly string[]): DirectionTrip =>
  ({ tripId: id, visits: stops.map((stopId, i) => ({ stopId, minutes: hm(start) + i * 3 })) });

const skipping = trunk.filter(s => s !== 't10' && s !== 't11');
const doylestownTrips = ['5:17', '6:09', '8:17', '9:17', '10:17', '11:17', '12:17', '13:17', '14:17', '15:17', '16:17', '17:08', '18:02', '19:13', '20:17', '21:17']
  .map((t, i) => trip(`doy${i}`, t, [...doylestown, ...trunk]));
// Through trips to another terminal, as in the feed: variants either way.
const others = [trip('o1', '6:12', [...trunk, 'x']), trip('o2', '15:14', [...trunk, 'x']), trip('o3', '22:47', [...doylestown, ...trunk, 'x'])];
/** The short turns, the one at `odd` running `oddStops`. */
const lansdale = (oddStops: readonly string[], odd = '16:16', times = ['5:09', '7:10', '7:41', '16:16', '17:12', '18:12']) =>
  times.map((t, i) => trip(`lan${i}`, t, t === odd ? oddStops : trunk));
const split = (trips: DirectionTrip[]) => {
  const d = directionStretches('LAN::1::Weekday', trips, coord);
  return { main: d.main!.stops.length, tails: d.tails.map(t => ({ stops: t.stops.length, midday: stretchFilterValue(stretchPeriods(t).midday) })) };
};

describe('#1513: a stop-skipping trip of a pattern does not change the branch split', () => {
  it('Sept 2026: the Lansdale short turns run steadily in the PM peak, so Doylestown is a branch read at its hourly service', () => {
    expect(split([...doylestownTrips, ...others, ...lansdale(trunk)])).toEqual({ main: 17, tails: [{ stops: 8, midday: 60 }] });
  });

  it('Nov 2026: the same short turns with the 16:16 skipping two stops give the same split', () => {
    expect(split([...doylestownTrips, ...others, ...lansdale(skipping)])).toEqual({ main: 17, tails: [{ stops: 8, midday: 60 }] });
  });

  it('a trip to another terminal is not the same pattern: the short turns stay unsteady and the line undivided', () => {
    expect(split([...doylestownTrips, ...others, ...lansdale([...trunk, 'x'])])).toEqual({ main: 25, tails: [] });
  });

  it('short turns that are not steady even with their stop-skipping trip stay variants: the line stays undivided', () => {
    const lan2024 = lansdale(skipping, '17:10', ['6:40', '11:53', '14:53', '17:10', '19:46']);
    expect(split([...doylestownTrips, ...others, ...lan2024])).toEqual({ main: 25, tails: [] });
  });

  it('a stop-skipping trip beside a pattern that is already regular stays a variant and leaves the split alone', () => {
    const base = split([...doylestownTrips, ...others, ...lansdale(trunk)]);
    const withExpress = split([...doylestownTrips, ...others, ...lansdale(trunk), trip('exp', '12:47', [...doylestown, ...skipping])]);
    expect(withExpress).toEqual(base);
  });
});
