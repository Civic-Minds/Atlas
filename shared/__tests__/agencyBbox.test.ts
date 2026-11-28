import { describe, expect, it } from 'vitest';
import { bboxOversized, bboxUndersized, stopsBbox } from '../agencyBbox';

describe('agency bbox from its stops (#1793)', () => {
  it('rounds the stops\' box outward', () => {
    expect(stopsBbox([[43.5921, -79.6476], [43.9093, -79.1134]])).toEqual([43.59, -79.65, 43.91, -79.11]);
    expect(stopsBbox([])).toBeNull();
  });
  it('flags the TTC\'s old box, which reached Hamilton', () => {
    const stops = stopsBbox([[43.5921, -79.6476], [43.9093, -79.1134]])!;
    expect(bboxOversized([43.25, -79.88, 44.05, -78.88], stops)).toBe(true);
    expect(bboxOversized(stops, stops)).toBe(false);
  });
  it('flags a box smaller than its own stops (#1794)', () => {
    const stops = stopsBbox([[43.5921, -79.6476], [43.9093, -79.1134]])!;
    expect(bboxUndersized([43.6, -79.6, 43.9, -79.2], stops)).toBe(true);
    expect(bboxUndersized(stops, stops)).toBe(false);
    expect(bboxUndersized([43.25, -79.88, 44.05, -78.88], stops)).toBe(false);
  });
});
