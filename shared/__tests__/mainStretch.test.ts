import { describe, expect, it } from 'vitest';
import { mainStretchStops, reliableStretch, stationOrLoop } from '../mainStretch';

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
