import { describe, expect, it } from 'vitest';
import { resolveDisplayHeadsign, isPlaceholderHeadsign, isRedundantWithRouteName } from '../headsignDisplay';

describe('resolveDisplayHeadsign', () => {
  it('keeps cleaned TTC station destinations', () => {
    const hs = 'South - 68 Warden towards Warden Station';
    expect(resolveDisplayHeadsign(hs, '68', 'Warden')).toBe('Warden Station');
  });

  it('falls back to raw GTFS when cleaning would over-strip', () => {
    expect(resolveDisplayHeadsign('Warden', '68', 'Warden')).toBe('Warden');
  });

  it('hides explicit non-stop placeholder destinations', () => {
    expect(isPlaceholderHeadsign('buffer (not a stop)')).toBe(true);
    expect(resolveDisplayHeadsign('buffer (not a stop)', null, 'Route 2 Jeff&Cent')).toBeNull();
  });
});

describe('isRedundantWithRouteName', () => {
  it('flags bare route long name', () => {
    expect(isRedundantWithRouteName('Warden', '68', 'Warden')).toBe(true);
  });

  it('does not flag distinct terminals', () => {
    expect(isRedundantWithRouteName('Warden Station', '68', 'Warden')).toBe(false);
  });
});
