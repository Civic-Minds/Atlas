import { describe, expect, it } from 'vitest';
import { stopDetail, type RouteStripStop } from '../routeStripModel';

const base: RouteStripStop = { stopId: 's', name: 'King St West at Bathurst St', delayMin: 1, lateShare: 0.1, bunchingShare: 0.12, n: 900, bunchingN: 938 };

describe('stopDetail bunching line', () => {
  it('splits the share into bunched and too long when both are known', () => {
    expect(stopDetail({ ...base, bunchedShare: 0.07, gappedShare: 0.05 }).lines).toContain('7% of gaps bunched, 5% too long (938 gaps)');
  });
  it('keeps the combined line when the parts are missing', () => {
    expect(stopDetail(base).lines).toContain('12% of gaps too short or too long (938 gaps)');
  });
});
