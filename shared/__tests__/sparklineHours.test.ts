import { describe, it, expect } from 'vitest';
import { SPARKLINE_HOURS } from '../config';

describe('SPARKLINE_HOURS', () => {
  it('runs 6 AM through 2 AM then overnight 3 AM, 4 AM, 5 AM', () => {
    expect(SPARKLINE_HOURS[0]).toBe(6);
    expect(SPARKLINE_HOURS).toContain(26); // 2 AM
    expect(SPARKLINE_HOURS.slice(-3)).toEqual([27, 28, 5]); // 3 AM, 4 AM, 5 AM
    expect(SPARKLINE_HOURS).toHaveLength(24);
  });
});
