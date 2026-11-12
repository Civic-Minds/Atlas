import { describe, it, expect } from 'vitest';
import { COMPARE_PATH, compareStepForPathChange, isAppGated, isCompareGated, RETIRED_APP_PATHS } from '../appGate';

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

describe('Compare at /apps/compare', () => {
  it('falls back to the map where Compare is off (flag off, or a phone)', () => {
    expect(isCompareGated(COMPARE_PATH, false)).toBe(true);
    expect(isCompareGated(COMPARE_PATH, true)).toBe(false);
    expect(isCompareGated('/', false)).toBe(false);
  });

  it('turns Compare on when the address arrives at /apps/compare (forward, or the tab in Live or History)', () => {
    expect(compareStepForPathChange('/', COMPARE_PATH, false)).toBe('start');
    expect(compareStepForPathChange('/apps/live', COMPARE_PATH, false)).toBe('start');
    expect(compareStepForPathChange('/', COMPARE_PATH, true)).toBeNull();
  });

  it('turns Compare off when the address leaves /apps/compare (Back)', () => {
    expect(compareStepForPathChange(COMPARE_PATH, '/', true)).toBe('exit');
    expect(compareStepForPathChange(COMPARE_PATH, '/apps/history', true)).toBe('exit');
    expect(compareStepForPathChange(COMPARE_PATH, '/', false)).toBeNull();
  });

  it('does nothing when the address stays put or moves between other pages', () => {
    expect(compareStepForPathChange(COMPARE_PATH, COMPARE_PATH, false)).toBeNull();
    expect(compareStepForPathChange('/', '/apps/history', true)).toBeNull();
  });
});
