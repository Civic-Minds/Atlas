import { describe, expect, it } from 'vitest';
import { stopRouteBestHeadway, stopRouteLineHeadway, stopRowHeadway, type StopBranch } from '../stopRoutes';

// CIV-997 / CIV-918: the stop card never states a destination as more frequent than it is.
const branch = (atStop: number | null, own: number | null, extra: Partial<StopBranch> = {}): StopBranch => ({
  rKey: 'ttc::504',
  headsign: 'Broadview',
  directionId: 0,
  service: { value: atStop, byPeriod: { midday: atStop }, provenance: 'stop-specific' } as StopBranch['service'],
  rowHeadway: own,
  ...extra,
});

describe('stopRowHeadway: never overstate', () => {
  it("uses the branch's own value when the stop's pooled value is more frequent (504A and 504B at King and Bay)", () => {
    expect(stopRowHeadway(branch(5, 10), 'midday')).toBe(10);
  });

  it("uses the stop's value when the branch's route-wide value counts trips that don't reach this stop (503 to Victoria Park)", () => {
    expect(stopRowHeadway(branch(10, 6), 'midday')).toBe(10);
  });

  it('falls back to whichever value exists', () => {
    expect(stopRowHeadway(branch(12, null), 'midday')).toBe(12);
    expect(stopRowHeadway(branch(null, 15), 'midday')).toBe(15);
  });

  it('shows words, not a number, for a part-period row', () => {
    expect(stopRowHeadway(branch(5, 10, { periodText: 'until 9:37am, every 12 min' }), 'midday')).toBeNull();
  });
});

describe('stopRouteLineHeadway', () => {
  it("shows the stop's value on the route line only where it beats every destination row", () => {
    expect(stopRouteLineHeadway([branch(5, 10), branch(5, 10, { headsign: 'Distillery' })], 'midday')).toBe(5);
    expect(stopRouteLineHeadway([branch(5, 10), branch(5, 5, { headsign: 'Distillery' })], 'midday')).toBeNull();
  });
});

describe('stopRouteBestHeadway', () => {
  it("orders routes by the stop's best value", () => {
    expect(stopRouteBestHeadway([branch(12, 20), branch(8, 10)], 'midday')).toBe(8);
    expect(stopRouteBestHeadway([branch(null, 20)], 'midday')).toBeNull();
  });
});
