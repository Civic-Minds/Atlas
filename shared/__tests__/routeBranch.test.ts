import { describe, expect, it } from 'vitest';
import { deriveRouteBranch } from '../routeBranch';

describe('deriveRouteBranch', () => {
  it('derives Ride On Flash branches from trip headsigns', () => {
    expect(deriveRouteBranch('rideon', 'FLASH', 'Briggs Chaney Park & Ride (Orange)')).toBe('Orange');
    expect(deriveRouteBranch('rideon', 'FLASH', 'Silver Spring Station ( Blue)')).toBe('Blue');
  });

  it('does not apply the feed-specific rule to other routes', () => {
    expect(deriveRouteBranch('rideon', 'FLASH', 'Silver Spring Station')).toBeNull();
    expect(deriveRouteBranch('other', 'FLASH', 'Silver Spring Station (Orange)')).toBeNull();
  });
});
