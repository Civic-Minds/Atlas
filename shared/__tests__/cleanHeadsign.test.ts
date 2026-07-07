import { describe, expect, it } from 'vitest';
import { cleanHeadsign } from '../cleanHeadsign';

describe('cleanHeadsign', () => {
  it('keeps TTC station destination when it shares the route long name', () => {
    const hs = 'South - 68 Warden towards Warden Station';
    expect(cleanHeadsign(hs, '68', 'Warden')).toBe('Warden Station');
  });

  it('still strips Station for unrelated destinations', () => {
    const hs = 'North - 68A Warden towards Steeles';
    expect(cleanHeadsign(hs, '68', 'Warden')).toBe('Steeles');
  });

  it('does not return empty for bare route long name (redundancy is display-time)', () => {
    expect(cleanHeadsign('Warden', '68', 'Warden')).toBe('Warden');
  });
});
