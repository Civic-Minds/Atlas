import { describe, expect, it } from 'vitest';
import { directionBranchFallback } from '../headsignDisplay';
import { directionLabel, type LiveV3 } from '../liveDashboard';

// CIV-1569 part 6: one fallback name for a direction, one numbering (from 1).
// The check that nothing builds this by hand is in src/content/__tests__/styleGuard.test.ts (CIV-1578).
describe('direction fallback (CIV-1569)', () => {
  it('the bound label when there is one, else "Direction " + the id counted from 1', () => {
    expect(directionBranchFallback(0)).toBe('Direction 1');
    expect(directionBranchFallback(1)).toBe('Direction 2');
    expect(directionBranchFallback(0, 'Westbound')).toBe('Westbound');
  });

  it("Live's direction names use the same fallback", () => {
    const v3 = { directionLabels: { '1': 'Eastbound' } } as unknown as LiveV3;
    expect(directionLabel(v3, 1)).toBe('Eastbound');
    expect(directionLabel(v3, 0)).toBe('Direction 1');
  });
});
