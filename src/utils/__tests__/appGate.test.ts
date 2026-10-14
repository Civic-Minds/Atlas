import { describe, it, expect } from 'vitest';
import { isAppGated, RETIRED_APP_PATHS } from '../appGate';

const allOn = { live: true, history: true, researchApps: true };

describe('isAppGated', () => {
  it('still lets the frequency map through', () => {
    expect(isAppGated('frequency', allOn)).toBe(false);
  });

  it('gates flagged apps when their flag is off', () => {
    const off = { live: false, history: false, researchApps: false };
    for (const app of ['live', 'history', 'night'] as const) {
      expect(isAppGated(app, off)).toBe(true);
      expect(isAppGated(app, allOn)).toBe(false);
    }
  });
});

describe('RETIRED_APP_PATHS', () => {
  it('keeps the unfinished Fares page and the retired Corridors page unreachable', () => {
    expect(RETIRED_APP_PATHS).toContain('/apps/fares');
    expect(RETIRED_APP_PATHS).toContain('/apps/corridors');
  });
});
