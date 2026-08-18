import { describe, expect, it } from 'vitest';
import { resolveDisplayHeadsign, isRedundantWithRouteName } from '../headsignDisplay';

describe('resolveDisplayHeadsign', () => {
  it('keeps cleaned TTC station destinations', () => {
    const hs = 'South - 68 Warden towards Warden Station';
    expect(resolveDisplayHeadsign(hs, '68', 'Warden')).toBe('Warden Station');
  });

  it('falls back to raw GTFS when cleaning would over-strip', () => {
    expect(resolveDisplayHeadsign('Warden', '68', 'Warden')).toBe('Warden');
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
