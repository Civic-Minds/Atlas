import { describe, expect, it } from 'vitest';
import { directionStretches, rollupDirection, type DirectionTrip } from '../tripSets';

// CIV-786: HSR 16 on weekends, direction 0. The same trip, Meadowlands to Garner at Wilson, runs via
// Wilson every 30 from 7:19 to 11:49, then via Fiddler's Green every 30 from 12:19 to 24:19 (GTFS,
// Saturday 2026-10-31). The morning pattern runs steadily through no period on its own, so it was not
// regular: the main stretch became all of Fiddler's Green, whose middle stop has no trip before noon,
// and the direction had no midday value.
const coords = new Map<string, [number, number]>();
const line = (prefix: string, n: number, lat0: number, lon0: number, dLat: number, dLon: number) =>
  Array.from({ length: n }, (_, i) => { const id = `${prefix}${i}`; coords.set(id, [lat0 + i * dLat, lon0 + i * dLon]); return id; });
const start = line('s', 1, 43.20, -79.99, 0, 0);
const viaW = line('w', 8, 43.201, -79.985, 0.002, 0);   // about 1.8 km on Wilson
const viaF = line('f', 30, 43.199, -79.985, -0.002, 0); // about 6.7 km by Fiddler's Green: its middle stop is off the trunk, as on HSR 16
const trunk = line('t', 12, 43.21, -79.97, 0, 0.003);
const end = line('e', 1, 43.21, -79.93, 0, 0);
const coord = (id: string) => coords.get(id);

function pattern(name: string, middle: string[], firstDeparture: number, every: number, count: number, endStops = end): DirectionTrip[] {
  const stops = [...start, ...middle, ...trunk, ...endStops];
  return Array.from({ length: count }, (_, n) => ({
    tripId: `${name}${n}`,
    visits: stops.map((stopId, i) => ({ stopId, minutes: firstDeparture + n * every + i })),
  }));
}
const wilsonMorning = pattern('w', viaW, 7 * 60 + 19, 30, 10);
// Fiddler's Green trips leave 22 minutes earlier so they reach the trunk on the same half-hour beat.
const fiddlersAfter = pattern('f', viaF, 11 * 60 + 57, 30, 25);

describe('patterns that take the same trip in turn (CIV-786)', () => {
  it('both are regular: the main stretch is the trunk they share, each road a tail', () => {
    const d = directionStretches('hsr16', [...wilsonMorning, ...fiddlersAfter], coord);
    expect(d.regularPatternCount).toBe(2);
    expect(d.main!.stops).toEqual([...start, ...trunk, ...end]);
    expect(d.tails.length).toBe(2);
  });

  it('the direction reads every 30 at midday, not nothing', () => {
    const r = rollupDirection(directionStretches('hsr16', [...wilsonMorning, ...fiddlersAfter], coord))!;
    expect(r.period.midday.filterValue).toBe(30);
  });

  it('not when the two run at the same time (a real branch pair is judged as before)', () => {
    // Fiddler's Green an hour earlier: its first trips reach the trunk before the last Wilson trip.
    const earlyFiddlers = pattern('f', viaF, 10 * 60 + 57, 30, 27);
    const d = directionStretches('hsr16', [...wilsonMorning, ...earlyFiddlers], coord);
    expect(d.regularPatternCount).toBe(1);
  });

  it('not when one ends somewhere else (a cut-back or an extension is not the same trip)', () => {
    const elsewhere = line('z', 1, 43.25, -79.80, 0, 0);
    const cutBack = pattern('w', viaW, 7 * 60 + 19, 30, 10, elsewhere);
    const d = directionStretches('hsr16', [...cutBack, ...fiddlersAfter], coord);
    expect(d.regularPatternCount).toBe(1);
  });

  it('not when the spacings differ (hourly in the morning, every 30 after)', () => {
    const hourly = pattern('w', viaW, 7 * 60 + 19, 60, 5);
    const d = directionStretches('hsr16', [...hourly, ...fiddlersAfter], coord);
    expect(d.regularPatternCount).toBe(1);
  });

  it('not when the other routing runs only at night (OC Transpo 39 after midnight): daytime shapes the stretches', () => {
    // Fiddler's Green all day, then the Wilson routing from 00:09 to 02:09 only.
    const allDay = pattern('f', viaF, 6 * 60 + 57, 30, 34);
    const nightOnly = pattern('w', viaW, 24 * 60 + 9, 30, 5);
    const d = directionStretches('oct39', [...allDay, ...nightOnly], coord);
    expect(d.regularPatternCount).toBe(1);
  });
});
