import { describe, expect, it } from 'vitest';
import { addCount, latestCount, liveCountKey, networkVehicleCount, parseCountDay } from '../liveNetworkCount';

describe('whole-network vehicle count (CIV-2939)', () => {
  const t = Date.UTC(2026, 10, 25, 14, 3, 20) / 1000;
  it('keeps one file per agency per UTC day', () => {
    expect(liveCountKey('ttc', t)).toBe('counts/ttc/2026-11-25.json');
  });
  it('counts every vehicle with a position, whatever its route', () => {
    expect(networkVehicleCount({ entity: [{ vehicle: { position: {} } }, { vehicle: { position: {} } }, { vehicle: null }, {}] })).toBe(2);
    expect(networkVehicleCount({})).toBe(0);
  });
  it('adds a minute in order, replacing a minute already there, and reads the latest', () => {
    let day = parseCountDay(null, 'ttc', t);
    day = addCount(day, t, 1500);
    day = addCount(day, t - 60, 1490);
    day = addCount(day, t + 5, 1502);
    expect(day.counts).toEqual([[t - 20 - 60, 1490], [t - 20, 1502]]);
    expect(latestCount(day)).toEqual({ at: t - 20, vehicles: 1502 });
  });
  it('starts a new day when the file is missing, unreadable or another day\'s', () => {
    expect(parseCountDay('not json', 'ttc', t).counts).toEqual([]);
    expect(parseCountDay(JSON.stringify({ agency: 'ttc', date: '2026-11-24', counts: [[1, 2]] }), 'ttc', t).counts).toEqual([]);
  });
});
