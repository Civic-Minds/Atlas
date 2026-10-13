import { describe, it, expect } from 'vitest';
import { isAppGated } from '../appGate';

const allOn = { live: true, history: true, corridors: true, researchApps: true };

describe('isAppGated', () => {
  it('never lets /apps/fares through, even with every flag on', () => {
    expect(isAppGated('fares', allOn)).toBe(true);
  });

  it('still lets the frequency map through', () => {
    expect(isAppGated('frequency', allOn)).toBe(false);
  });

  it('gates flagged apps when their flag is off', () => {
    const off = { live: false, history: false, corridors: false, researchApps: false };
    for (const app of ['live', 'history', 'corridors', 'night'] as const) {
      expect(isAppGated(app, off)).toBe(true);
      expect(isAppGated(app, allOn)).toBe(false);
    }
  });
});
