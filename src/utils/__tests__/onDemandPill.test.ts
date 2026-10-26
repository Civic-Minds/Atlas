import { describe, expect, it } from 'vitest';
import { onDemandPillSelected } from '../onDemandPill';

describe('onDemandPillSelected', () => {
  it('starts unselected for an agency with routes (MARTA)', () => {
    expect(onDemandPillSelected({ hasPill: true, choice: null, routeCount: 90 })).toBe(false);
  });
  it('starts selected when the agency has no routes to list', () => {
    expect(onDemandPillSelected({ hasPill: true, choice: null, routeCount: 0 })).toBe(true);
  });
  it('follows the viewer once they pick', () => {
    expect(onDemandPillSelected({ hasPill: true, choice: true, routeCount: 90 })).toBe(true);
    expect(onDemandPillSelected({ hasPill: true, choice: false, routeCount: 0 })).toBe(false);
  });
  it('is never selected without the pill', () => {
    expect(onDemandPillSelected({ hasPill: false, choice: true, routeCount: 0 })).toBe(false);
  });
});
