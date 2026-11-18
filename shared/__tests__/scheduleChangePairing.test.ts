import { describe, expect, it } from 'vitest';
import { pairChanges } from '../scheduleChangePairing';

describe('schedule change pairing (CIV-1864)', () => {
  it('merges a route removed and added under a differently cased name into one change', () => {
    const out = pairChanges([
      { route: 'KING', name: 'King St', before: { trips: 10 }, after: null },
      { route: 'King', name: 'King Street', before: null, after: { trips: 12 } },
      { route: '5', name: null, before: { trips: 3 }, after: { trips: 4 } },
      { route: '7', name: null, before: { trips: 1 }, after: null },
    ]);
    expect(out).toHaveLength(3);
    expect(out.find(c => c.route === 'King')).toEqual({ route: 'King', name: 'King Street', before: { trips: 10 }, after: { trips: 12 } });
    expect(out.find(c => c.route === '7')?.after).toBeNull();
  });
});
