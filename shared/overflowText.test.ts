import { describe, expect, it } from 'vitest';
import { andOthers } from './overflowText';

describe('andOthers', () => {
  it('uses the singular for exactly one', () => {
    expect(andOthers(1, 'agency', 'agencies')).toBe('and 1 other agency');
    expect(andOthers(1, 'route')).toBe('and 1 other route');
  });
  it('uses the plural for several', () => {
    expect(andOthers(3, 'agency', 'agencies')).toBe('and 3 other agencies');
    expect(andOthers(2, 'route')).toBe('and 2 other routes');
    expect(andOthers(12, 'vehicle')).toBe('and 12 other vehicles');
  });
  it('defaults the plural to adding s', () => {
    expect(andOthers(4, 'stop')).toBe('and 4 other stops');
  });
});
