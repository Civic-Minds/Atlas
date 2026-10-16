import { describe, expect, it } from 'vitest';
import { branchPatterns, mainStretchStops, reliableStretch, stationOrLoop } from '../mainStretch';

describe('mainStretchStops', () => {
  it('keeps the stops every regular pattern serves, so a common short turn sets the stretch', () => {
    // 510 southbound shape: half the trips short-turn before the last two stops.
    const full = { stops: ['A', 'B', 'C', 'D', 'E', 'F'], trips: 50 };
    const turn = { stops: ['A', 'B', 'C', 'D'], trips: 45 };
    expect(mainStretchStops([full, turn])).toEqual(['A', 'B', 'C', 'D']);
  });
  it('treats a pattern under 20% of trips as a variant that does not shorten the stretch', () => {
    expect(mainStretchStops([{ stops: ['A', 'B', 'C', 'D'], trips: 90 }, { stops: ['A', 'B'], trips: 10 }])).toEqual(['A', 'B', 'C', 'D']);
  });
  it('falls back to stops more than half the trips serve when regular patterns share nothing', () => {
    expect(mainStretchStops([{ stops: ['A', 'B', 'C'], trips: 60 }, { stops: ['X', 'Y'], trips: 40 }])).toEqual(['A', 'B', 'C']);
  });
});

describe('reliableStretch', () => {
  const cov: Record<string, number> = { A: 0.2, B: 0.9, C: 0.95, D: 0.9, E: 0.4 };
  it('trims ends with too few measured departures (an underground loop) and known poor first stops', () => {
    expect(reliableStretch(['A', 'B', 'C', 'D', 'E'], s => cov[s])).toEqual(['B', 'C', 'D']);
    expect(reliableStretch(['A', 'B', 'C', 'D', 'E'], s => cov[s], 2)).toEqual(['C', 'D']);
  });
  it('gives null when fewer than two stops are left', () => {
    expect(reliableStretch(['A', 'E'], s => cov[s])).toBeNull();
  });
});

describe('stationOrLoop', () => {
  it('puts every bay of a station, and a loop, under one place; ordinary stops are none', () => {
    expect(stationOrLoop('St Clair West Station at Bay 3')).toBe('st clair west station');
    expect(stationOrLoop('St Clair West Station at Bay 4')).toBe('st clair west station');
    expect(stationOrLoop('Exhibition Loop at Manitoba Dr')).toBe('exhibition loop');
    expect(stationOrLoop('Dundas St West at University Ave - St Patrick Station')).toBeNull();
    expect(stationOrLoop('Queen St East at Neville Park Blvd')).toBeNull();
  });
});

describe('branchPatterns', () => {
  const pat = (stops: string[], trips: number, step = 400) => ({ stops, trips, along: stops.map((_, i) => i * step) });
  it('picks a regular pattern with a long tail off the main stretch (507 and its 507M branch)', () => {
    const shared = ['A', 'B', 'C'];
    const main = pat([...shared, 'D', 'E', 'F', 'G', 'H', 'I'], 70);
    const branch = pat([...shared, 'M1', 'M2', 'M3', 'M4', 'M5'], 27);
    const stretch = mainStretchStops([main, branch]);
    expect(stretch).toEqual(shared);
    expect(branchPatterns([main, branch], stretch, 5, 1000)).toEqual([main, branch]);
  });
  it('ignores a short turn (no tail), a short or under-1 km tail, and a variant under 20% of trips', () => {
    const main = pat(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'], 60);
    const turn = pat(['A', 'B', 'C', 'D'], 30);
    const stretch = mainStretchStops([main, turn]);
    expect(branchPatterns([main, turn], stretch, 5, 1000)).toEqual([main]);
    const shortTail = pat(['A', 'B', 'C', 'X1', 'X2'], 40);
    expect(branchPatterns([pat(['A', 'B', 'C'], 60), shortTail], ['A', 'B', 'C'], 5, 1000)).toEqual([]);
    const near = pat(['A', 'B', 'C', 'Y1', 'Y2', 'Y3', 'Y4', 'Y5'], 40, 100);
    expect(branchPatterns([pat(['A', 'B', 'C'], 60), near], ['A', 'B', 'C'], 5, 1000)).toEqual([]);
    const rare = pat(['A', 'B', 'C', 'Z1', 'Z2', 'Z3', 'Z4', 'Z5'], 5);
    expect(branchPatterns([pat(['A', 'B', 'C'], 95), rare], ['A', 'B', 'C'], 5, 1000)).toEqual([]);
  });
});
